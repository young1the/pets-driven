import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_PET_ASSETS,
  FALLBACK_CODEX_PET_SPRITESHEET_URL,
  PLAYGROUND_PET_ASSET_BY_ENTITY_ID,
  getCodexPetSpritesheetUrl,
  loadPlaygroundPetAssetCatalog,
} from "@/pets/assets/codex-pet-fixtures";
import * as codexPetFixtures from "@/pets/assets/codex-pet-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("codex pet fixtures", () => {
  it("maps every default Codex pet package into a playground entity", () => {
    expect(CODEX_PET_ASSETS.map((asset) => asset.id)).toEqual([
      "agumon",
      "gabumon",
      "gomamon",
      "palmon",
      "patamon",
      "piyomon",
      "tentomon",
    ]);
    expect(Object.keys(PLAYGROUND_PET_ASSET_BY_ENTITY_ID)).toEqual([
      "pet-a",
      "pet-b",
      "pet-c",
      "pet-d",
      "pet-e",
      "pet-f",
      "pet-g",
    ]);
  });

  it("uses the Codex pets route for spritesheets without rewriting pet packages", () => {
    expect(getCodexPetSpritesheetUrl("agumon")).toBe(
      "/codex-pets/agumon/spritesheet.webp",
    );
  });

  it("loads a canvas asset catalog keyed by world entity id", async () => {
    const loadedUrls: string[] = [];
    const catalog = await loadPlaygroundPetAssetCatalog(async (url) => {
      loadedUrls.push(url);
      return { src: url } as HTMLImageElement;
    });

    expect(Object.keys(catalog)).toEqual([
      "pet-a",
      "pet-b",
      "pet-c",
      "pet-d",
      "pet-e",
      "pet-f",
      "pet-g",
    ]);
    expect(catalog["pet-a"].src).toBe("/codex-pets/agumon/spritesheet.webp");
    expect(loadedUrls).toHaveLength(7);
  });

  it("falls back to the bundled Patamon spritesheet when a Codex pet is missing", async () => {
    const loadedUrls: string[] = [];
    const catalog = await loadPlaygroundPetAssetCatalog(async (url) => {
      loadedUrls.push(url);
      if (url.startsWith("/codex-pets/")) {
        throw new Error(`Missing pet package: ${url}`);
      }
      return { src: url } as HTMLImageElement;
    });

    expect(catalog["pet-a"].src).toBe(FALLBACK_CODEX_PET_SPRITESHEET_URL);
    expect(loadedUrls).toContain("/codex-pets/agumon/spritesheet.webp");
    expect(loadedUrls).toContain(FALLBACK_CODEX_PET_SPRITESHEET_URL);
  });

  it("keeps the canvas asset catalog runtime-neutral", async () => {
    const catalog = await loadPlaygroundPetAssetCatalog(async (url) => {
      return { src: url } as HTMLImageElement;
    });

    expect(catalog["pet-a"].src).toBe("/codex-pets/agumon/spritesheet.webp");
  });

  it("keeps Tauri spritesheet transport outside the pets package API", () => {
    expect("loadCodexPetSpritesheetUrl" in codexPetFixtures).toBe(false);
  });
});
