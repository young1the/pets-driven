import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(testDir);
const marketplaceRoot = dirname(pluginRoot);
const marketplacePath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
assert.equal(existsSync(manifestPath), true, "Codex manifest should live in the shared plugin folder");

const manifest = readJson(manifestPath);
assert.equal(manifest.name, "pets-driven");
assert.equal(manifest.skills, "./skills/");
assert.equal(manifest.hooks, "./hooks/codex-hooks.json");
assert.equal(existsSync(join(pluginRoot, manifest.skills)), true, "Codex skills folder should exist");
assert.equal(existsSync(join(pluginRoot, manifest.hooks)), true, "Codex hooks file should exist");

const attachSkill = readFileSync(join(pluginRoot, "skills", "attach", "SKILL.md"), "utf8");
const hatchSkill = readFileSync(join(pluginRoot, "skills", "hatch", "SKILL.md"), "utf8");
assert.match(attachSkill, /\.\.\/\.\.\/commands\/attach\.md/);
assert.match(hatchSkill, /\.\.\/\.\.\/commands\/hatch\.md/);

const marketplace = readJson(marketplacePath);
const entry = marketplace.plugins.find((plugin) => plugin.name === "pets-driven");
assert.ok(entry, "Marketplace should expose the shared pets-driven plugin");
assert.equal(entry.source.source, "local");
assert.equal(normalize(entry.source.path), normalize("./pets-driven"));
assert.equal(existsSync(join(marketplaceRoot, entry.source.path)), true);
