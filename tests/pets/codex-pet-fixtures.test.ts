import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_PET_ASSETS,
  FALLBACK_CODEX_PET_SPRITESHEET_URL,
  PLAYGROUND_PET_ASSET_BY_ENTITY_ID,
  getCodexPetSpritesheetUrl,
  loadPlaygroundPetAssetCatalog,
} from "@/pets/assets/codex-pet-fixtures";
import { invoke, isTauri } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));

const isTauriMock = vi.mocked(isTauri);
const invokeMock = vi.mocked(invoke);
const originalCreateObjectURL = URL.createObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  vi.restoreAllMocks();
  isTauriMock.mockReset();
  isTauriMock.mockReturnValue(false);
  invokeMock.mockReset();
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

  it("loads Codex pet spritesheets through Tauri when running in the desktop shell", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const createObjectUrlMock = vi
      .fn<typeof URL.createObjectURL>()
      .mockReturnValue("blob:codex-pet");
    URL.createObjectURL = createObjectUrlMock;

    const catalog = await loadPlaygroundPetAssetCatalog(async (url) => {
      return { src: url } as HTMLImageElement;
    });

    expect(invokeMock).toHaveBeenCalledWith("load_codex_pet_spritesheet", {
      assetId: "agumon",
    });
    expect(catalog["pet-a"].src).toBe("blob:codex-pet");
  });
});
