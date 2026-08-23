import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every manifest that carries this product's version, and how each one spells
 * it. One release, one number: the desktop app, the Rust crates behind it (the
 * `pdd` binary answers `--version` from its own crate, so a crate left behind
 * tells the user they are running last release), the workspace packages, and
 * the plugin manifests users install by.
 *
 * Missing files are an error rather than a skip. The list drifting away from
 * the repository is the failure this exists to prevent, and a bump that quietly
 * covers four of five manifests looks exactly like one that covered all five.
 */
export const BUMPED_MANIFESTS = [
  // The desktop app. `.github/workflows/release.yml` checks the tag against
  // this file, so it is also where the current version is read from.
  { file: "apps/desktop/src-tauri/Cargo.toml", kind: "cargo" },
  { file: "apps/desktop/package.json", kind: "json" },

  // The Rust workspace behind it.
  { file: "crates/pets-driven-core/Cargo.toml", kind: "cargo" },
  { file: "crates/pets-driven-fs/Cargo.toml", kind: "cargo" },
  { file: "crates/pets-driven-protocol/Cargo.toml", kind: "cargo" },
  { file: "crates/pets-driven-cli/Cargo.toml", kind: "cargo" },

  // The workspace packages. Private, but they are what the app is assembled
  // from, and a version that never moves is worse than no version at all.
  { file: "packages/design-system/package.json", kind: "json" },
  { file: "packages/i18n/package.json", kind: "json" },
  { file: "packages/pet-engine/package.json", kind: "json" },
  { file: "apps/web/package.json", kind: "json" },

  // The plugin, and the marketplace entry that offers it. These are the
  // versions a user sees when they install or update the agent bridge.
  { file: "plugins/pets-driven/.claude-plugin/plugin.json", kind: "json" },
  { file: "plugins/pets-driven/.codex-plugin/plugin.json", kind: "json" },
  { file: "plugins/.claude-plugin/marketplace.json", kind: "json" },
];

/**
 * The version the release is cut from and the tag is checked against.
 * `.github/workflows/release.yml` reads this same file.
 */
const VERSION_SOURCE_REL = "apps/desktop/src-tauri/Cargo.toml";

/**
 * Rewritten by `cargo update`, not by us, but it is committed and it moves with
 * every crate version. One lockfile for the whole Cargo workspace — it lives at
 * the repository root, not under the desktop crate.
 */
const CARGO_LOCK_REL = "Cargo.lock";

/** The files a bump touches, as repo-relative pathspecs for git. */
export const BUMPED_FILES_REL = [
  ...BUMPED_MANIFESTS.map((manifest) => manifest.file),
  CARGO_LOCK_REL,
];

const GITBUTLER_WORKSPACE_BRANCH = "gitbutler/workspace";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

// Matches only the version inside the `[package]` section. `[^[]*?` bounds the
// scope up to the next section header, so it doesn't match a dependency's
// version = "2" or similar.
const PACKAGE_VERSION = /(\[package\][^[]*?\nversion\s*=\s*")([^"]+)(")/;

// The one `"version": "…"` a manifest is allowed to carry. Matching the text
// rather than parsing and re-serializing keeps these files byte-identical apart
// from the number — a release commit should not also reformat a manifest.
const JSON_VERSION = /("version"\s*:\s*")([^"]+)(")/g;

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

function jsonVersionMatches(json) {
  return [...json.matchAll(JSON_VERSION)];
}

export function readJsonVersion(json) {
  const matches = jsonVersionMatches(json);
  if (matches.length === 0) {
    throw new Error('no "version" field found');
  }
  if (matches.length > 1) {
    throw new Error(`expected one "version" field, found ${matches.length}`);
  }
  return matches[0][2];
}

/**
 * Set the single `"version"` field, keeping any semver build metadata that was
 * already on it: the Codex plugin manifest carries a `+codex.<stamp>` suffix
 * that says which packaging run produced it, and that is not ours to drop.
 */
export function replaceJsonVersion(json, version) {
  const current = readJsonVersion(json);
  const buildMetadata = current.includes("+") ? current.slice(current.indexOf("+")) : "";

  return json.replace(JSON_VERSION, `$1${version}${buildMetadata}$3`);
}

const EDITORS = {
  cargo: { read: readCargoVersion, replace: replaceCargoVersion },
  json: { read: readJsonVersion, replace: replaceJsonVersion },
};

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

  const missing = BUMPED_FILES_REL.filter((file) => !existsSync(resolve(ROOT, file)));
  if (missing.length > 0) {
    fail(
      `These files are on the bump list but not in the repository:\n  ${missing.join("\n  ")}\n` +
        "Either they moved, or a manifest was deleted. Fix the list in scripts/bump-version.mjs\n" +
        "rather than letting a release go out with some versions left behind.",
    );
  }

  const current = readCargoVersion(readFileSync(resolve(ROOT, VERSION_SOURCE_REL), "utf8"));

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
    for (const { file, kind } of BUMPED_MANIFESTS) {
      const path = resolve(ROOT, file);
      const editor = EDITORS[kind];
      const source = readFileSync(path, "utf8");
      const was = editor.read(source);
      const updated = editor.replace(source, next);
      // Read the result back rather than printing `next`: a manifest may keep
      // build metadata, and the log should say what the file now holds.
      const now = editor.read(updated);

      writeFileSync(path, updated);

      if (was !== now) {
        console.log(`  ${file}: ${was} -> ${now}`);
      }
    }

    // --workspace only re-resolves workspace members. It doesn't touch external
    // dependencies, so only this product's versions in Cargo.lock get updated.
    execFileSync("cargo", ["update", "--workspace"], {
      cwd: ROOT,
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
    fail(
      `The ${tag} release commit was created, but tagging failed. Tag it yourself:\n\n  git tag -a ${tag} -m ${tag}\n\n${error.message}`,
    );
  }

  console.log(`\n${current} -> ${next} across ${BUMPED_MANIFESTS.length} manifests`);
  console.log(`\nCommitted and tagged ${tag}. To release, run:\n\n  git push --follow-tags\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
