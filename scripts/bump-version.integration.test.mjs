// Integration coverage for scripts/bump-version.mjs. Unlike bump-version.test.mjs
// (which exercises the pure helpers in-process), these tests build a real,
// throwaway git repository, copy the shipped script into it verbatim, and run
// it as a child process. No mocks: git, cargo, and the filesystem are all real.
//
// This file exists specifically to catch a regression class: restore() must
// roll the working tree back from HEAD, not from the index. `git checkout --
// <files>` (no tree-ish) restores from the index, and because `git add` runs
// before `git commit`, a commit failure would leave the bump silently staged
// while the script claims the tree was restored. See the "git commit fails"
// case below.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REAL_SCRIPT = resolve(ROOT, "scripts/bump-version.mjs");

const CARGO_TOML_TEMPLATE = `[package]
name = "fixture-app"
version = "0.1.0"
edition = "2021"

[dependencies]
`;

const LIB_RS = `pub fn placeholder() {}\n`;

const PACKAGE_JSON_TEMPLATE = {
  name: "fixture-app",
  version: "0.1.0",
  private: true,
};

function gitEnv(cwd, ...args) {
  return execFileSync(
    "git",
    ["-c", "user.email=fixture@example.com", "-c", "user.name=Fixture", ...args],
    { cwd, encoding: "utf8" },
  ).trim();
}

// Builds a fresh throwaway git repo under os.tmpdir() with the shipped
// bump-version.mjs and a minimal, valid Cargo/npm project. Everything is
// committed so the working tree starts clean and HEAD holds version 0.1.0.
function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), "bump-version-it-"));

  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "apps/desktop/src-tauri/src"), { recursive: true });

  writeFileSync(join(dir, "scripts/bump-version.mjs"), readFileSync(REAL_SCRIPT));
  writeFileSync(join(dir, "apps/desktop/src-tauri/Cargo.toml"), CARGO_TOML_TEMPLATE);
  writeFileSync(join(dir, "apps/desktop/src-tauri/src/lib.rs"), LIB_RS);
  writeFileSync(
    join(dir, "apps/desktop/package.json"),
    `${JSON.stringify(PACKAGE_JSON_TEMPLATE, null, 2)}\n`,
  );

  // cargo update needs a Cargo.lock to update; generate it before the base
  // commit so the fixture's single base commit already has it checked in,
  // matching what a real project would have.
  if (cargoAvailable) {
    execFileSync("cargo", ["generate-lockfile"], {
      cwd: join(dir, "apps/desktop/src-tauri"),
      stdio: "ignore",
    });
  }

  gitEnv(dir, "init", "--quiet");
  gitEnv(dir, "add", "-A");
  gitEnv(dir, "commit", "--quiet", "-m", "chore: fixture base commit");

  return dir;
}

function removeFixture(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

function runScript(dir, arg, extraEnv) {
  const result = execFileSync(process.execPath, [join(dir, "scripts/bump-version.mjs"), arg], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: 0, stdout: result, stderr: "" };
}

// execFileSync throws on non-zero exit; normalize both outcomes to one shape.
function runScriptAllowFailure(dir, arg, extraEnv) {
  try {
    return runScript(dir, arg, extraEnv);
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

function readCargoTomlVersionOnDisk(dir) {
  const toml = readFileSync(join(dir, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
  const match = /\[package\][^[]*?\nversion\s*=\s*"([^"]+)"/.exec(toml);
  return match?.[1];
}

function readPackageJsonVersionOnDisk(dir) {
  return JSON.parse(readFileSync(join(dir, "apps/desktop/package.json"), "utf8")).version;
}

// Builds a PATH that has git available but not cargo, by scanning the real
// PATH for directories that contain a git executable and excluding any
// directory that also contains a cargo executable. Returns undefined if no
// such PATH can be built (git and cargo colocated everywhere on this machine).
function buildPathWithGitNoCargo() {
  const gitExe = process.platform === "win32" ? "git.exe" : "git";
  const cargoExe = process.platform === "win32" ? "cargo.exe" : "cargo";

  const entries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const kept = entries.filter((entry) => {
    const hasGit = existsSync(join(entry, gitExe));
    const hasCargo = existsSync(join(entry, cargoExe));
    return hasGit && !hasCargo;
  });

  if (kept.length === 0) {
    return undefined;
  }
  return kept.join(delimiter);
}

let cargoAvailable = true;
try {
  execFileSync("cargo", ["--version"], { stdio: "ignore" });
} catch {
  cargoAvailable = false;
}

test("git commit fails after git add succeeded: tree is restored from HEAD, not the index", () => {
  const dir = createFixture();
  try {
    const hookPath = join(dir, ".git/hooks/pre-commit");
    writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
    // Git for Windows' hook runner dispatches on the shebang line rather than
    // the POSIX executable bit, so this file is enough to make the hook fire
    // there. On POSIX, mark it executable too so it fires the same way.
    try {
      execFileSync("chmod", ["+x", hookPath]);
    } catch {
      // chmod unavailable on this PATH; the shebang-based dispatch above
      // still makes Git for Windows run the hook.
    }

    const beforeLog = gitEnv(dir, "log", "--oneline");

    const result = runScriptAllowFailure(dir, "patch");

    assert.equal(result.status, 1, `expected exit 1, stderr:\n${result.stderr}`);
    assert.match(result.stderr, /Bump failed before the release commit was created/);

    assert.equal(readCargoTomlVersionOnDisk(dir), "0.1.0");
    assert.equal(readPackageJsonVersionOnDisk(dir), "0.1.0");

    // This is the assertion that fails against the old buggy
    // `git checkout -- <files>`: a commit failure leaves the bump staged,
    // so `git status --porcelain` would show the staged Cargo.toml/package.json
    // changes instead of an empty, clean tree.
    assert.equal(gitEnv(dir, "status", "--porcelain"), "");

    assert.equal(gitEnv(dir, "tag", "--list"), "");
    assert.equal(gitEnv(dir, "log", "--oneline"), beforeLog);
  } finally {
    removeFixture(dir);
  }
});

test("cargo update fails: tree is restored from HEAD, not the index", (t) => {
  if (!cargoAvailable) {
    t.skip("cargo is not installed on this machine; cannot exercise the cargo-update-fails path");
    return;
  }

  const restrictedPath = buildPathWithGitNoCargo();
  if (!restrictedPath) {
    t.skip("could not build a PATH containing git but not cargo on this machine");
    return;
  }

  const dir = createFixture();
  try {
    const beforeLog = gitEnv(dir, "log", "--oneline");

    const result = runScriptAllowFailure(dir, "patch", { PATH: restrictedPath, Path: restrictedPath });

    assert.equal(result.status, 1, `expected exit 1, stderr:\n${result.stderr}`);
    assert.match(result.stderr, /Bump failed before the release commit was created/);

    assert.equal(readCargoTomlVersionOnDisk(dir), "0.1.0");
    assert.equal(readPackageJsonVersionOnDisk(dir), "0.1.0");
    assert.equal(gitEnv(dir, "status", "--porcelain"), "");
    assert.equal(gitEnv(dir, "tag", "--list"), "");
    assert.equal(gitEnv(dir, "log", "--oneline"), beforeLog);
  } finally {
    removeFixture(dir);
  }
});

test("happy path: bump, commit, and tag succeed with no push attempted", (t) => {
  if (!cargoAvailable) {
    t.skip("cargo is not installed on this machine; cannot exercise the happy path");
    return;
  }

  const dir = createFixture();
  try {
    const result = runScript(dir, "patch");

    assert.equal(result.status, 0, `expected exit 0, stderr:\n${result.stderr}`);
    assert.equal(readCargoTomlVersionOnDisk(dir), "0.1.1");
    assert.equal(readPackageJsonVersionOnDisk(dir), "0.1.1");

    assert.equal(gitEnv(dir, "status", "--porcelain"), "");

    const lastCommitSubject = gitEnv(dir, "log", "-1", "--format=%s");
    assert.equal(lastCommitSubject, "chore(release): v0.1.1");

    assert.equal(gitEnv(dir, "tag", "--list", "v0.1.1"), "v0.1.1");

    // The tag must be annotated, not lightweight. `git push --follow-tags` —
    // the command the script tells you to run next — silently skips
    // lightweight tags, so the release workflow would never fire.
    assert.equal(gitEnv(dir, "cat-file", "-t", "v0.1.1"), "tag");

    // Fixture has no remote, so a push attempt would have failed loudly.
    // Exit 0 already proves no push was attempted; also confirm the fixture
    // has exactly two commits: the fixture's base commit and the release
    // commit the script created.
    const commitCount = Number(gitEnv(dir, "rev-list", "--count", "HEAD"));
    assert.equal(commitCount, 2);
  } finally {
    removeFixture(dir);
  }
});

test("refuses to cut a release from GitButler's workspace branch", () => {
  const dir = createFixture();
  try {
    gitEnv(dir, "checkout", "--quiet", "-b", "gitbutler/workspace");

    const result = runScriptAllowFailure(dir, "patch");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /gitbutler\/workspace/);
    assert.match(result.stderr, /usually main/);

    // The guard must fire before anything is written.
    assert.equal(readCargoTomlVersionOnDisk(dir), "0.1.0");
    assert.equal(readPackageJsonVersionOnDisk(dir), "0.1.0");
    assert.equal(gitEnv(dir, "status", "--porcelain"), "");
    assert.equal(gitEnv(dir, "tag", "--list"), "");
  } finally {
    removeFixture(dir);
  }
});
