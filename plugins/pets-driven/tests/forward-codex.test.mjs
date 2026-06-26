import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(testDir);
const hookScript = join(pluginRoot, "hooks", "forward-codex");
const runHookCmd = join(pluginRoot, "hooks", "run-hook.cmd");
const bashBin = findBash();

function findBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "bash",
  ];

  return candidates.find((candidate) => candidate === "bash" || existsSync(candidate));
}

function bashArgs(...args) {
  return [hookScript, ...args];
}

function render(eventName, env = {}) {
  const output = execFileSync(bashBin, bashArgs("--print", eventName), {
    cwd: pluginRoot,
    env: { ...process.env, ...env },
    input: "{}",
    encoding: "utf8",
  });

  return JSON.parse(output);
}

assert.equal(existsSync(hookScript), true, "forward-codex hook script should exist");

const selfCheck = spawnSync(bashBin, bashArgs("--self-check"), {
  cwd: pluginRoot,
  encoding: "utf8",
});

assert.equal(selfCheck.status, 0, selfCheck.stderr || selfCheck.stdout);
assert.match(selfCheck.stdout, /self-check passed/);

assert.deepEqual(
  {
    hook_event_name: render("UserPromptSubmit").hook_event_name,
    sourceId: render("UserPromptSubmit").sourceId,
    summary: render("UserPromptSubmit").summary,
  },
  {
    hook_event_name: "UserPromptSubmit",
    sourceId: "codex",
    summary: "Codex prompt received",
  },
);

assert.deepEqual(
  {
    hook_event_name: render("PermissionRequest").hook_event_name,
    message: render("PermissionRequest").message,
  },
  {
    hook_event_name: "PermissionRequest",
    message: "Codex needs permission",
  },
);

assert.equal(render("Stop").hook_event_name, "Stop");
assert.equal(render("Stop").summary, "Codex turn completed");

const windowsPathPayload = render("UserPromptSubmit", {
  PETS_DRIVEN_TEST_CWD: "C:\\work\\pets-driven",
});

assert.equal(windowsPathPayload.cwd, "C:\\work\\pets-driven");

const defaultCwdPayload = render("UserPromptSubmit");

assert.match(defaultCwdPayload.cwd, /^[A-Z]:\\/i);

const msysPathPayload = render("UserPromptSubmit", {
  PATH: "C:\\Windows\\System32;C:\\Windows",
  PETS_DRIVEN_TEST_CWD: "/d/workspaces/gabumon",
});

assert.equal(msysPathPayload.cwd, "D:\\workspaces\\gabumon");

function renderWithCmdWrapper(eventName, env = {}) {
  if (process.platform !== "win32") {
    return render(eventName, env);
  }

  const result = spawnSync(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-Command", `& '${runHookCmd}' forward-codex --print ${eventName}`],
    {
      cwd: pluginRoot,
      env: { ...process.env, ...env },
      input: "{}",
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
const windowsOnlyPathPayload = renderWithCmdWrapper("UserPromptSubmit", {
  PATH: "C:\\Windows\\System32;C:\\Windows",
  PETS_DRIVEN_TEST_CWD: "C:\\work\\pets-driven",
});

assert.deepEqual(
  {
    hook_event_name: windowsOnlyPathPayload.hook_event_name,
    cwd: windowsOnlyPathPayload.cwd,
    summary: windowsOnlyPathPayload.summary,
  },
  {
    hook_event_name: "UserPromptSubmit",
    cwd: "C:\\work\\pets-driven",
    summary: "Codex prompt received",
  },
);

const wrapperCwdPayload = renderWithCmdWrapper("UserPromptSubmit", {
  PATH: "C:\\Windows\\System32;C:\\Windows",
});

assert.match(wrapperCwdPayload.cwd, /^[A-Z]:\\/i);
