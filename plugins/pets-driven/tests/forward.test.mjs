import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(testDir);
const hookScript = join(pluginRoot, "hooks", "forward");
const bashBin = findBash();

function findBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "bash",
  ];

  return candidates.find((candidate) => candidate === "bash" || existsSync(candidate));
}

assert.equal(existsSync(hookScript), true, "forward hook script should exist");

const selfCheck = spawnSync(bashBin, [hookScript, "--self-check"], {
  cwd: pluginRoot,
  encoding: "utf8",
});

assert.equal(selfCheck.status, 0, selfCheck.stderr || selfCheck.stdout);
assert.match(selfCheck.stdout, /self-check passed/);

// The agent must never read pets-driven's own data off disk -- every lookup goes
// through the desktop app's ingress. Guard the modes that serve those lookups.
const script = readFileSync(hookScript, "utf8");

for (const mode of ["options", "list", "hatch", "bind", "unbind"]) {
  assert.match(
    script,
    new RegExp(`^\\s*${mode}\\)`, "m"),
    `forward should dispatch a "${mode}" mode`,
  );
}

for (const path of [
  "/pets-driven/options",
  "/pets-driven/list",
  "/pets-driven/hatch",
  "/pets-driven/pet/update",
]) {
  assert.ok(script.includes(path), `forward should reach the ingress at ${path}`);
}
