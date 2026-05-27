import { loadAtlasImage } from "@/pets/assets/atlas-loader";
import type { AssetCatalog } from "@/playground/browser/canvas-renderer";
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

export async function loadPlaygroundPetAssetCatalog(
  loadImage: (url: string) => Promise<HTMLImageElement> = loadAtlasImage,
): Promise<AssetCatalog> {
  const entries = await Promise.all(
    Object.entries(PLAYGROUND_PET_ASSET_BY_ENTITY_ID).map(
      async ([entityId, assetId]) => [
        entityId,
        await loadImage(getCodexPetSpritesheetUrl(assetId)).catch(() =>
          loadImage(FALLBACK_CODEX_PET_SPRITESHEET_URL),
        ),
      ] as const,
    ),
  );

  return Object.fromEntries(entries);
}
