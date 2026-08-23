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

import { BUMPED_MANIFESTS, readCargoVersion, readJsonVersion } from "./bump-version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REAL_SCRIPT = resolve(ROOT, "scripts/bump-version.mjs");

const LIB_RS = `pub fn placeholder() {}\n`;

// One manifest carries semver build metadata (the Codex plugin manifest says
// which packaging run produced it); the fixture carries it too, so the happy
// path proves a bump keeps it.
const BUILD_METADATA_FILE = "plugins/pets-driven/.codex-plugin/plugin.json";
const BUILD_METADATA = "+codex.20260726135510";

const cargoManifests = BUMPED_MANIFESTS.filter((manifest) => manifest.kind === "cargo");

/** `crates/pets-driven-fs/Cargo.toml` -> `pets-driven-fs`. */
function crateName(file) {
  const parts = dirname(file).split("/");
  const own = parts[parts.length - 1];
  return own === "src-tauri" ? "pets-driven" : own;
}

function cargoToml(file) {
  return [
    "[package]",
    `name = "${crateName(file)}"`,
    'version = "0.1.0"',
    'edition = "2021"',
    "",
    "[dependencies]",
    "",
  ].join("\n");
}

function jsonManifest(file) {
  const metadata = file === BUILD_METADATA_FILE ? BUILD_METADATA : "";
  const manifest = { name: "fixture", version: `0.1.0${metadata}`, private: true };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// The crates are one Cargo workspace, so the lockfile the script commits is
// the one at the root -- the same shape as the real repository.
function workspaceToml() {
  const members = cargoManifests.map((manifest) => `    "${dirname(manifest.file)}",`);
  return ["[workspace]", 'resolver = "2"', "members = [", ...members, "]", ""].join("\n");
}

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
  writeFileSync(join(dir, "scripts/bump-version.mjs"), readFileSync(REAL_SCRIPT));

  // Built from the script's own list rather than a hand-written set: a
  // manifest added there has to appear here too, or the fixture stops standing
  // in for the repository the script actually runs against.
  for (const { file, kind } of BUMPED_MANIFESTS) {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), kind === "cargo" ? cargoToml(file) : jsonManifest(file));
    if (kind === "cargo") {
      mkdirSync(join(dir, dirname(file), "src"), { recursive: true });
      writeFileSync(join(dir, dirname(file), "src/lib.rs"), LIB_RS);
    }
  }

  writeFileSync(join(dir, "Cargo.toml"), workspaceToml());

  // cargo update needs a Cargo.lock to update; generate it before the base
  // commit so the fixture's single base commit already has it checked in,
  // matching what a real project would have.
  if (cargoAvailable) {
    execFileSync("cargo", ["generate-lockfile"], { cwd: dir, stdio: "ignore" });
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

    // Every manifest, not just the desktop pair: one release is one number, and
    // a crate left behind is what makes `pdd --version` answer last release.
    for (const { file, kind } of BUMPED_MANIFESTS) {
      const text = readFileSync(join(dir, file), "utf8");
      const found = kind === "cargo" ? readCargoVersion(text) : readJsonVersion(text);
      const expected = file === BUILD_METADATA_FILE ? `0.1.1${BUILD_METADATA}` : "0.1.1";

      assert.equal(found, expected, `${file} was left at ${found}`);
    }

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

test("refuses to bump when a manifest on the list is not in the repository", () => {
  const dir = createFixture();
  try {
    // The list going stale is the failure this guards: it named a lockfile at a
    // path that had moved, so a release bump died at `git add` -- and a list
    // that skipped missing files instead would have shipped a release with that
    // manifest silently left behind.
    rmSync(join(dir, BUMPED_MANIFESTS[BUMPED_MANIFESTS.length - 1].file));
    gitEnv(dir, "add", "-A");
    gitEnv(dir, "commit", "--quiet", "-m", "chore: drop a manifest");

    const result = runScriptAllowFailure(dir, "patch");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /on the bump list but not in the repository/);
    assert.equal(readCargoTomlVersionOnDisk(dir), "0.1.0");
    assert.equal(gitEnv(dir, "status", "--porcelain"), "");
    assert.equal(gitEnv(dir, "tag", "--list"), "");
  } finally {
    removeFixture(dir);
  }
});
