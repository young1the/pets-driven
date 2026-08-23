import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  BUMPED_MANIFESTS,
  nextVersion,
  readCargoVersion,
  readJsonVersion,
  replaceCargoVersion,
  replaceJsonVersion,
} from "./bump-version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGE_JSON = `{
  "name": "pets-driven",
  "version": "0.2.0",
  "private": true,
  "dependencies": {
    "react": "^18.3.1"
  }
}
`;

const CARGO_TOML = `[package]
name = "pets-driven"
version = "0.1.0"
description = "Codex pet playground"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
`;

test("nextVersion bumps patch", () => {
  assert.equal(nextVersion("0.1.0", "patch"), "0.1.1");
});

test("nextVersion bumps minor and resets patch", () => {
  assert.equal(nextVersion("0.1.4", "minor"), "0.2.0");
});

test("nextVersion bumps major and resets minor and patch", () => {
  assert.equal(nextVersion("0.2.3", "major"), "1.0.0");
});

test("nextVersion accepts an explicit version", () => {
  assert.equal(nextVersion("0.1.0", "1.4.2"), "1.4.2");
});

test("nextVersion rejects a bad argument", () => {
  assert.throws(() => nextVersion("0.1.0", "1.4"), /major\|minor\|patch/);
});

test("nextVersion rejects an unparseable current version", () => {
  assert.throws(() => nextVersion("0.1.0-beta", "patch"), /Cannot parse/);
});

test("readCargoVersion reads the [package] version", () => {
  assert.equal(readCargoVersion(CARGO_TOML), "0.1.0");
});

test("readCargoVersion ignores dependency versions", () => {
  const bumped = replaceCargoVersion(CARGO_TOML, "0.2.0");
  assert.equal(readCargoVersion(bumped), "0.2.0");
});

test("replaceCargoVersion leaves the tauri dependency alone", () => {
  const bumped = replaceCargoVersion(CARGO_TOML, "0.2.0");
  assert.match(bumped, /tauri = \{ version = "2"/);
  assert.match(bumped, /name = "pets-driven"/);
});

test("replaceCargoVersion throws when [package] has no version", () => {
  assert.throws(
    () => replaceCargoVersion(`[package]\nname = "x"\n`, "0.2.0"),
    /version not found/,
  );
});

test("readJsonVersion reads the manifest's own version, not a dependency range", () => {
  assert.equal(readJsonVersion(PACKAGE_JSON), "0.2.0");
});

test("replaceJsonVersion changes the version and nothing else", () => {
  const bumped = replaceJsonVersion(PACKAGE_JSON, "1.0.0");

  assert.equal(readJsonVersion(bumped), "1.0.0");
  assert.equal(bumped, PACKAGE_JSON.replace('"0.2.0"', '"1.0.0"'));
});

test("replaceJsonVersion keeps semver build metadata", () => {
  const manifest = `{ "version": "0.1.0+codex.20260726135510" }`;

  assert.equal(readJsonVersion(replaceJsonVersion(manifest, "1.0.0")), "1.0.0+codex.20260726135510");
});

test("readJsonVersion throws when there is no version to bump", () => {
  assert.throws(() => readJsonVersion(`{ "name": "x" }`), /no "version" field/);
});

test("readJsonVersion throws rather than guess between two version fields", () => {
  assert.throws(
    () => readJsonVersion(`{ "version": "1.0.0", "tool": { "version": "2.0.0" } }`),
    /found 2/,
  );
});

// Directories that hold no manifest of ours, and would make this walk crawl.
const SKIPPED_DIRECTORIES = new Set(["node_modules", "target", "dist", "build", ".next", "public"]);
const MANIFEST_NAMES = new Set(["Cargo.toml", "package.json", "plugin.json", "marketplace.json"]);

/** Whether a Cargo.toml is a package manifest rather than a bare workspace. */
function carriesCargoVersion(source) {
  try {
    readCargoVersion(source);
    return true;
  } catch {
    return false;
  }
}

function findManifests(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        findManifests(path, found);
      }
      continue;
    }
    if (MANIFEST_NAMES.has(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

/**
 * The guard on the list itself. A version-carrying manifest that nobody added
 * to BUMPED_MANIFESTS is invisible to a release, which is how `pdd --version`
 * came to answer a version behind the app it shipped inside.
 */
test("every version-carrying manifest in the repo is on the bump list", () => {
  const listed = new Set(BUMPED_MANIFESTS.map((manifest) => manifest.file));
  const missing = [];

  for (const root of ["apps", "packages", "crates", "plugins"]) {
    for (const path of findManifests(join(ROOT, root))) {
      const source = readFileSync(path, "utf8");
      // Asked the same way the script asks, so this cannot disagree with it.
      const carriesVersion = path.endsWith("Cargo.toml")
        ? carriesCargoVersion(source)
        : source.includes('"version"');
      const relativePath = relative(ROOT, path).split(sep).join("/");

      if (carriesVersion && !listed.has(relativePath)) {
        missing.push(relativePath);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `these carry a version but no release would ever move it: ${missing.join(", ")}`,
  );
});

test("the bump list has no duplicates and every entry is in the repo", () => {
  const files = BUMPED_MANIFESTS.map((manifest) => manifest.file);

  assert.equal(new Set(files).size, files.length, "a manifest is listed twice");
  for (const file of files) {
    assert.doesNotThrow(() => readFileSync(join(ROOT, file), "utf8"), file);
  }
});
