import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

const hookConfig = readJson(join(pluginRoot, manifest.hooks));

function commandHookFor(eventName) {
  const eventGroups = hookConfig.hooks[eventName];
  assert.equal(Array.isArray(eventGroups), true, `${eventName} should be configured`);
  const [eventGroup] = eventGroups;
  const [commandHook] = eventGroup.hooks;

  assert.equal(commandHook.type, "command", `${eventName} should use a command hook`);
  return commandHook;
}

for (const eventName of ["UserPromptSubmit", "PermissionRequest", "Stop"]) {
  const commandHook = commandHookFor(eventName);

  assert.match(commandHook.command, /\.codex\/plugins\/cache\/pets-driven\/pets-driven\/0\.1\.0/);
  assert.match(commandHook.commandWindows, /\$env:PLUGIN_ROOT/);
  assert.match(commandHook.commandWindows, /\$env:USERPROFILE/);
  assert.doesNotMatch(commandHook.commandWindows, /%USERPROFILE%/);
}

if (process.platform === "win32") {
  const codexPayload = {
    hook_event_name: "UserPromptSubmit",
    cwd: "D:\\pets-driven",
    session_id: "codex-session",
  };
  const result = spawnSync(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandHookFor("UserPromptSubmit").commandWindows],
    {
      cwd: pluginRoot,
      env: { ...process.env, PLUGIN_ROOT: pluginRoot },
      input: JSON.stringify(codexPayload),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const printCommand = commandHookFor("UserPromptSubmit").commandWindows.replace(
    "forward-codex UserPromptSubmit",
    "forward-codex --print UserPromptSubmit",
  );
  const printResult = spawnSync(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", printCommand],
    {
      cwd: pluginRoot,
      env: { ...process.env, PLUGIN_ROOT: pluginRoot },
      input: JSON.stringify(codexPayload),
      encoding: "utf8",
    },
  );

  assert.equal(printResult.status, 0, printResult.stderr || printResult.stdout);
  assert.deepEqual(JSON.parse(printResult.stdout), codexPayload);
}

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
