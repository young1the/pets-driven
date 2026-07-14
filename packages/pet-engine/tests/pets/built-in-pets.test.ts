import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CODEX_PET_ASSETS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";

// The repo-root `pets/` directory is the single source of truth for built-in
// pets (see pets/README.md). CODEX_PET_ASSETS mirrors that metadata for the
// engine; this suite fails the moment the two drift, which is the guardrail
// that lets pet.json be authored once and trusted everywhere.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PETS_DIR = join(REPO_ROOT, "pets");

type PetManifest = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

function readManifest(id: string): PetManifest {
  return JSON.parse(readFileSync(join(PETS_DIR, id, "pet.json"), "utf8")) as PetManifest;
}

function petDirIds(): string[] {
  return readdirSync(PETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("built-in pets", () => {
  it("has one pets/ directory per CODEX_PET_ASSETS entry and vice versa", () => {
    const assetIds = CODEX_PET_ASSETS.map((asset) => asset.id).sort();
    expect(petDirIds()).toEqual(assetIds);
  });

  it("keeps each pet.json manifest identical to its CODEX_PET_ASSETS entry", () => {
    for (const asset of CODEX_PET_ASSETS) {
      const manifest = readManifest(asset.id);
      expect(manifest.id).toBe(asset.id);
      expect(manifest.displayName).toBe(asset.displayName);
      expect(manifest.description).toBe(asset.description);
      expect(manifest.spritesheetPath).toBe(asset.spritesheetPath);
    }
  });

  it("ships a non-empty spritesheet at each manifest's declared path", () => {
    for (const asset of CODEX_PET_ASSETS) {
      const manifest = readManifest(asset.id);
      const sheet = join(PETS_DIR, asset.id, manifest.spritesheetPath);
      expect(existsSync(sheet)).toBe(true);
      expect(statSync(sheet).size).toBeGreaterThan(0);
    }
  });
});
