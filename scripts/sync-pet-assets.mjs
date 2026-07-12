// Copies the built-in pets from the repo-root `pets/` source of truth into each
// app's `public/` so the browser fixtures (web + desktop playground) can serve
// them by URL. The public copies are git-ignored build artifacts — this script
// is the only thing that should write them. It runs automatically from each
// app's dev/build (see apps/web/package.json pre-hooks and the desktop Vite
// plugin in apps/desktop/vite.config.ts), and can be run by hand via
// `pnpm sync-pets`.
//
// Idempotent and content-addressed: a destination file is only rewritten when
// its bytes differ, so a warm dev server's file watcher doesn't churn on every
// invocation.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PETS_SRC = resolve(ROOT, "pets");

// The pet whose sheet doubles as the load-failure fallback. Must stay in step
// with FALLBACK_CODEX_PET_SPRITESHEET_URL in
// packages/pet-engine/src/pets/assets/codex-pet-fixtures.ts.
const FALLBACK_PET_ID = "bloop";

/**
 * @typedef {Object} SyncTarget
 * @property {string} publicDir  Absolute path to the app's public/ directory.
 * @property {boolean} fallback  Whether to also emit public/fallback-pets/<id>.
 */

/** @type {Record<string, SyncTarget>} */
const TARGETS = {
  web: {
    publicDir: resolve(ROOT, "apps/web/public"),
    fallback: false,
  },
  desktop: {
    publicDir: resolve(ROOT, "apps/desktop/public"),
    fallback: true,
  },
};

function listPetIds() {
  return readdirSync(PETS_SRC, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// Copy only when bytes differ so we don't touch mtimes (and wake file watchers)
// on an unchanged file.
function copyIfChanged(srcFile, destFile) {
  const src = readFileSync(srcFile);
  if (existsSync(destFile)) {
    const dest = readFileSync(destFile);
    if (dest.equals(src)) {
      return false;
    }
  }
  mkdirSync(dirname(destFile), { recursive: true });
  writeFileSync(destFile, src);
  return true;
}

function syncTarget(name, target) {
  const petIds = listPetIds();
  const codexRoot = join(target.publicDir, "codex-pets");

  // Drop pets the source no longer has, so a renamed/removed pet doesn't linger
  // in the generated copy.
  if (existsSync(codexRoot)) {
    for (const entry of readdirSync(codexRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !petIds.includes(entry.name)) {
        rmSync(join(codexRoot, entry.name), { recursive: true, force: true });
      }
    }
  }

  let written = 0;
  for (const id of petIds) {
    const srcDir = join(PETS_SRC, id);
    for (const file of readdirSync(srcDir)) {
      if (statSync(join(srcDir, file)).isFile()) {
        if (copyIfChanged(join(srcDir, file), join(codexRoot, id, file))) {
          written += 1;
        }
      }
    }
  }

  if (target.fallback) {
    const fallbackSrc = join(PETS_SRC, FALLBACK_PET_ID, "spritesheet.webp");
    const fallbackDest = join(
      target.publicDir,
      "fallback-pets",
      FALLBACK_PET_ID,
      "spritesheet.webp",
    );
    if (existsSync(fallbackSrc)) {
      if (copyIfChanged(fallbackSrc, fallbackDest)) {
        written += 1;
      }
    }
  }

  return { name, petCount: petIds.length, written };
}

function run(targetNames) {
  if (!existsSync(PETS_SRC)) {
    throw new Error(`Pets source directory not found: ${PETS_SRC}`);
  }

  const results = [];
  for (const name of targetNames) {
    const target = TARGETS[name];
    if (!target) {
      throw new Error(
        `Unknown sync target "${name}". Known targets: ${Object.keys(TARGETS).join(", ")}`,
      );
    }
    results.push(syncTarget(name, target));
  }

  for (const result of results) {
    console.log(
      `sync-pet-assets: ${result.name} <- ${result.petCount} pets (${result.written} file(s) updated)`,
    );
  }
}

// A bare invocation syncs every target; pass names to scope it, e.g.
// `node scripts/sync-pet-assets.mjs desktop`.
const requested = process.argv.slice(2);
const targetNames = requested.length > 0 ? requested : Object.keys(TARGETS);

try {
  run(targetNames);
} catch (error) {
  console.error(`sync-pet-assets failed: ${error.message}`);
  process.exit(1);
}
