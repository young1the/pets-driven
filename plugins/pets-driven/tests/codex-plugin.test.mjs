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
assert.equal(manifest.skills, "./codex-skills/");
assert.equal(manifest.hooks, "./hooks/codex-hooks.json");
assert.equal(existsSync(join(pluginRoot, manifest.skills)), true, "Codex skills folder should exist");
assert.equal(existsSync(join(pluginRoot, manifest.hooks)), true, "Codex hooks file should exist");

const hookConfig = readJson(join(pluginRoot, manifest.hooks));

function commandHookFor(eventName) {
  const eventGroups = hookConfig.hooks[eventName];
  assert.equal(Array.isArray(eventGroups), true, `${eventName} should be configured`);
  const [eventGroup] = eventGroups;
  const [commandHook] = eventGroup.hooks;

  assert.equal(commandHook.type, "command", `${eventName} should use a command hook`);
  return commandHook;
}

for (const eventName of [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
]) {
  const commandHook = commandHookFor(eventName);

  // pdd inherits the hook payload on stdin, so Windows paths and non-ASCII
  // prompts never cross a PowerShell-string or Git Bash encoding boundary.
  assert.equal(commandHook.command, `pdd forward ${eventName}`);
  assert.equal(commandHook.commandWindows, commandHook.command);
  assert.doesNotMatch(commandHook.command, /PLUGIN_ROOT|plugins\/cache|run-hook|bash/i);
}

const claudeHookConfig = readJson(join(pluginRoot, "hooks", "hooks.json"));
for (const eventName of [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Notification",
  "StopFailure",
  "Stop",
]) {
  assert.equal(
    Array.isArray(claudeHookConfig.hooks[eventName]),
    true,
    `Claude ${eventName} should be configured`,
  );
}

const hatchSkill = readFileSync(join(pluginRoot, "codex-skills", "hatch", "SKILL.md"), "utf8");
assert.match(hatchSkill, /\.\.\/\.\.\/commands\/hatch\.md/);

const marketplace = readJson(marketplacePath);
const entry = marketplace.plugins.find((plugin) => plugin.name === "pets-driven");
assert.ok(entry, "Marketplace should expose the shared pets-driven plugin");
assert.equal(entry.source.source, "local");
assert.equal(normalize(entry.source.path), normalize("./pets-driven"));
assert.equal(existsSync(join(marketplaceRoot, entry.source.path)), true);
