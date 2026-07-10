import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nextVersion,
  readCargoVersion,
  replaceCargoVersion,
} from "./bump-version.mjs";

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
