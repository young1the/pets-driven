import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_TAURI = resolve(ROOT, "apps/desktop/src-tauri");

// The files a bump touches. git() runs with cwd: ROOT and git pathspecs use
// forward slashes on every platform, so these stay repo-relative and literal.
// Cargo.lock is rewritten by `cargo update`, not by us, but it is committed.
const BUMPED_FILES_REL = [
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/Cargo.lock",
  "apps/desktop/package.json",
];

const [CARGO_TOML, , PACKAGE_JSON] = BUMPED_FILES_REL.map((file) => resolve(ROOT, file));

const GITBUTLER_WORKSPACE_BRANCH = "gitbutler/workspace";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

// Matches only the version inside the `[package]` section. `[^[]*?` bounds the
// scope up to the next section header, so it doesn't match a dependency's
// version = "2" or similar.
const PACKAGE_VERSION = /(\[package\][^[]*?\nversion\s*=\s*")([^"]+)(")/;

export function nextVersion(current, arg) {
  const parsed = SEMVER.exec(current);
  if (!parsed) {
    throw new Error(`Cannot parse current version: ${current}`);
  }

  const [major, minor, patch] = parsed.slice(1).map(Number);

  switch (arg) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (!SEMVER.test(arg)) {
        throw new Error(`Invalid argument: ${arg}. Expected major|minor|patch or X.Y.Z`);
      }
      return arg;
  }
}

export function readCargoVersion(toml) {
  const found = PACKAGE_VERSION.exec(toml);
  if (!found) {
    throw new Error("version not found in [package] section of Cargo.toml");
  }
  return found[2];
}

export function replaceCargoVersion(toml, version) {
  if (!PACKAGE_VERSION.test(toml)) {
    throw new Error("version not found in [package] section of Cargo.toml");
  }
  return toml.replace(PACKAGE_VERSION, `$1${version}$3`);
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Discards the bump from both the index and the working tree. The `HEAD`
// tree-ish is load-bearing: a bare `git checkout --` restores from the index,
// which by then may already hold a staged bump, making the rollback a silent
// no-op. Only safe to call before the release commit exists; once a commit has
// landed, restoring files would misrepresent what actually happened.
function restore() {
  git("checkout", "HEAD", "--", ...BUMPED_FILES_REL);
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    fail("usage: pnpm release:bump <major|minor|patch|X.Y.Z>");
  }

  // The repo's pre-commit hook rejects every `git commit` on GitButler's
  // workspace branch, so the commit below would fail there. Say so plainly
  // rather than letting the hook's output be the explanation.
  if (git("branch", "--show-current") === GITBUTLER_WORKSPACE_BRANCH) {
    fail(
      `Cannot cut a release from ${GITBUTLER_WORKSPACE_BRANCH}: its pre-commit hook rejects git commit.\n` +
        "Check out the branch you are releasing from (usually main) and run this again.",
    );
  }

  if (git("status", "--porcelain") !== "") {
    fail("Working tree is not clean. Commit or stash your changes first.");
  }

  const toml = readFileSync(CARGO_TOML, "utf8");
  const current = readCargoVersion(toml);

  let next;
  try {
    next = nextVersion(current, arg);
  } catch (error) {
    fail(error.message);
  }

  const tag = `v${next}`;
  if (git("tag", "--list", tag) !== "") {
    fail(`Tag ${tag} already exists.`);
  }

  // Everything from the first write until the commit lands is one unit: if any
  // of it fails, the tree goes back to where it started.
  try {
    writeFileSync(CARGO_TOML, replaceCargoVersion(toml, next));

    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
    pkg.version = next;
    writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);

    // --workspace only re-resolves workspace members. It doesn't touch external
    // dependencies, so only pets-driven's version baked into Cargo.lock gets updated.
    execFileSync("cargo", ["update", "--workspace"], {
      cwd: SRC_TAURI,
      stdio: "inherit",
    });

    git("add", ...BUMPED_FILES_REL);
    git("commit", "-m", `chore(release): ${tag}`);
  } catch (error) {
    let aftermath = "The working tree has been restored.";
    try {
      restore();
    } catch (restoreError) {
      aftermath = `Restoring the working tree also failed, so it is still dirty. Inspect it with git status.\n${restoreError.message}`;
    }
    fail(`Bump failed before the release commit was created. ${aftermath}\n${error.message}`);
  }

  try {
    // Annotated, not lightweight: `git push --follow-tags` — the command
    // printed below — silently skips lightweight tags, so the release
    // workflow would never see the tag and no release would ever be built.
    git("tag", "-a", tag, "-m", tag);
  } catch (error) {
    fail(`The ${tag} release commit was created, but tagging failed. Tag it yourself:\n\n  git tag -a ${tag} -m ${tag}\n\n${error.message}`);
  }

  console.log(`${current} -> ${next}`);
  console.log(`\nCommitted and tagged ${tag}. To release, run:\n\n  git push --follow-tags\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
