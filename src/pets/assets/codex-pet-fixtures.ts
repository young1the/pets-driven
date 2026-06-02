import { loadAtlasImage } from "@/pets/assets/atlas-loader";
import type { AssetCatalog } from "@/pets/rendering/pet-sprite-canvas";
import type { PetAsset } from "@/pets/assets/pet-asset";

export const CODEX_PET_ASSETS: PetAsset[] = [
  {
    id: "agumon",
    displayName: "Agumon",
    description:
      "Agumon, the rookie partner Digimon from Digimon Adventure, redrawn as a Codex pixel pet.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "gabumon",
    displayName: "Gabumon",
    description:
      "Gabumon, the rookie partner Digimon from Digimon Adventure, redrawn as a Codex pixel pet.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "gomamon",
    displayName: "Gomamon",
    description:
      "Gomamon, the rookie partner Digimon from Digimon Adventure, redrawn as a Codex pixel pet.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "palmon",
    displayName: "Palmon",
    description:
      "Palmon, the rookie partner Digimon from Digimon Adventure, redrawn as a Codex pixel pet.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "patamon",
    displayName: "Patamon",
    description:
      "A compact Patamon digital pet in a playful low crouch with tall wing ears, orange head mask, cream body, blue eyes, tiny paws, and a cheerful smile.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "piyomon",
    displayName: "Piyomon",
    description:
      "Piyomon, the rookie partner Digimon from Digimon Adventure, redrawn as a Codex pixel pet.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "tentomon",
    displayName: "Tentomon",
    description:
      "Tentomon, the rookie partner Digimon from Digimon Adventure, redrawn as a Codex pixel pet.",
    spritesheetPath: "spritesheet.webp",
  },
];

export const PLAYGROUND_PET_ASSET_BY_ENTITY_ID = {
  "pet-a": "agumon",
  "pet-b": "gabumon",
  "pet-c": "gomamon",
  "pet-d": "palmon",
  "pet-e": "patamon",
  "pet-f": "piyomon",
  "pet-g": "tentomon",
} as const;

export type PlaygroundPetEntityId =
  keyof typeof PLAYGROUND_PET_ASSET_BY_ENTITY_ID;

export const FALLBACK_CODEX_PET_SPRITESHEET_URL =
  "/fallback-pets/patamon/spritesheet.webp";

export function getCodexPetSpritesheetUrl(assetId: string) {
  return `/codex-pets/${assetId}/spritesheet.webp`;
}

async function isTauriRuntime() {
  const { isTauri } = await import("@tauri-apps/api/core");

  return isTauri();
}

async function loadCodexPetSpritesheetBytes(assetId: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  const response = await invoke<ArrayBuffer | Uint8Array | number[]>(
    "load_codex_pet_spritesheet",
    { assetId },
  );

  if (response instanceof ArrayBuffer) {
    return response;
  }

  return new Uint8Array(response).buffer;
}

async function loadCodexPetImage(
  assetId: string,
  loadImage: (url: string) => Promise<HTMLImageElement>,
) {
  if (!(await isTauriRuntime())) {
    return await loadImage(getCodexPetSpritesheetUrl(assetId));
  }

  const bytes = await loadCodexPetSpritesheetBytes(assetId);
  const objectUrl = URL.createObjectURL(
    new Blob([bytes], { type: "image/webp" }),
  );

  try {
    return await loadImage(objectUrl);
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function loadPlaygroundPetAssetCatalog(
  loadImage: (url: string) => Promise<HTMLImageElement> = loadAtlasImage,
): Promise<AssetCatalog> {
  const entries = await Promise.all(
    Object.entries(PLAYGROUND_PET_ASSET_BY_ENTITY_ID).map(
      async ([entityId, assetId]) => [
        entityId,
        await loadCodexPetImage(assetId, loadImage).catch(() =>
          loadImage(FALLBACK_CODEX_PET_SPRITESHEET_URL),
        ),
      ] as const,
    ),
  );

  return Object.fromEntries(entries);
}
