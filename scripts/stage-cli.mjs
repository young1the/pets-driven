// Build the `pdd` CLI in release and stage it as a Tauri `externalBin` sidecar
// so it ships inside the desktop installer.
//
// Tauri's `externalBin` expects a file named `<name>-<target-triple><ext>` under
// the config's `binaries/` directory; at bundle time Tauri copies the matching
// one next to the app executable (installed as `pdd.exe`). We build for the host
// and copy the result there.
//
// Run by the desktop `beforeBuildCommand`. Assumes the host triple equals the
// bundle target (the normal case — an installer is built on its target arch); a
// `tauri build --target <other>` would need a matching cross-built sidecar.
//
// NOTE: written without a Windows/Tauri build available to run it. Verify the
// staged filename and the installed location on a real build.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Host target triple, e.g. `x86_64-pc-windows-msvc`.
const rustcVersion = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const triple = rustcVersion.match(/^host:\s*(.+)$/m)?.[1]?.trim();
if (!triple) {
  throw new Error("could not read the host target triple from `rustc -vV`");
}

// Build pdd for the host (lands in target/release/, independent of any
// `--target` the desktop build uses).
execFileSync("cargo", ["build", "--release", "-p", "pets-driven-cli"], {
  cwd: repoRoot,
  stdio: "inherit",
});

const exeSuffix = triple.includes("windows") ? ".exe" : "";
const source = join(repoRoot, "target", "release", `pdd${exeSuffix}`);
const binariesDir = join(repoRoot, "apps", "desktop", "src-tauri", "binaries");
mkdirSync(binariesDir, { recursive: true });
const dest = join(binariesDir, `pdd-${triple}${exeSuffix}`);

copyFileSync(source, dest);
console.log(`staged pdd sidecar: ${dest}`);
