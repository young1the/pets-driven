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

  // The payload must reach the hook script as raw stdin bytes. Reading it into a
  // PowerShell string and piping that to the script round-trips it through the
  // console encoding and $OutputEncoding (ASCII on Windows PowerShell 5.1),
  // which turns every non-ASCII character -- a Korean prompt, a Korean path --
  // into "?". The child inherits stdin instead.
  assert.doesNotMatch(commandHook.commandWindows, /\[Console\]::In/);
  assert.doesNotMatch(commandHook.commandWindows, /\$payload/);
}

if (process.platform === "win32") {
  // Non-ASCII in both a path and a prompt: the two places a Korean user hits
  // the encoding boundary between Codex, PowerShell and the hook script.
  const codexPayload = {
    hook_event_name: "UserPromptSubmit",
    cwd: "D:\\pets-driven\\기타개선",
    session_id: "codex-session",
    prompt: "안녕 한국어 테스트",
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

const hatchSkill = readFileSync(join(pluginRoot, "skills", "hatch", "SKILL.md"), "utf8");
assert.match(hatchSkill, /\.\.\/\.\.\/commands\/hatch\.md/);

const marketplace = readJson(marketplacePath);
const entry = marketplace.plugins.find((plugin) => plugin.name === "pets-driven");
assert.ok(entry, "Marketplace should expose the shared pets-driven plugin");
assert.equal(entry.source.source, "local");
assert.equal(normalize(entry.source.path), normalize("./pets-driven"));
assert.equal(existsSync(join(marketplaceRoot, entry.source.path)), true);
