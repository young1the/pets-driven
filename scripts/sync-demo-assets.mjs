// Copies the demo GIFs from the repo-root `docs/assets/` source of truth into
// the landing site's `public/demo/` so the browser can serve them by URL. The
// public copies are git-ignored build artifacts — this script is the only thing
// that should write them — so the same bytes are not committed twice and the
// site cannot drift from the GIFs the READMEs show.
//
// It runs automatically from the web app's dev/build (see the pre-hooks in
// apps/web/package.json).
//
// Idempotent and content-addressed, like sync-pet-assets.mjs: a destination
// file is only rewritten when its bytes differ, so a warm dev server's file
// watcher doesn't churn on every invocation.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "docs/assets");
const DEST = resolve(ROOT, "apps/web/public/demo");

if (!existsSync(SRC)) {
  console.error(`[sync-demo-assets] missing source directory: ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

let written = 0;
const gifs = readdirSync(SRC).filter((name) => name.endsWith(".gif"));

for (const name of gifs) {
  const from = readFileSync(join(SRC, name));
  const to = join(DEST, name);
  if (existsSync(to) && readFileSync(to).equals(from)) continue;
  writeFileSync(to, from);
  written += 1;
}

console.log(`[sync-demo-assets] ${gifs.length} gif(s) checked, ${written} written -> ${DEST}`);
