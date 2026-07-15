import { loadAtlasImage } from "@pets-driven/pet-engine/pets/assets/atlas-loader";
import type { PetAsset } from "@pets-driven/pet-engine/pets/assets/pet-asset";
import type { AssetCatalog } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";

export const CODEX_PET_ASSETS: PetAsset[] = [
  {
    id: "cato",
    displayName: "Cato",
    description:
      "A tiny lavender cat companion with soft rounded proportions, glossy eyes, rosy cheeks, and expressive task animations.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "otto",
    displayName: "Otto",
    description:
      "A tiny golden puppy companion with floppy ears, glossy eyes, rosy cheeks, and expressive task animations.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "mochi",
    displayName: "Mochi",
    description:
      "A tiny pink bunny companion with tall soft ears, glossy eyes, rosy cheeks, and expressive task animations.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "fenn",
    displayName: "Fenn",
    description:
      "A tiny coral fox companion with sharp little ears, a fluffy tail, glossy eyes, and expressive task animations.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "bloop",
    displayName: "Bloop",
    description:
      "A tiny mint frog companion with round raised eyes, rosy cheeks, a gentle goofy face, and expressive task animations.",
    spritesheetPath: "spritesheet.webp",
  },
  {
    id: "pip",
    displayName: "Pip",
    description:
      "A tiny sky-blue bird companion with little wings, a feather tuft, glossy eyes, and expressive task animations.",
    spritesheetPath: "spritesheet.webp",
  },
];

export const PLAYGROUND_PET_ASSET_BY_ENTITY_ID = {
  "pet-a": "cato",
  "pet-b": "otto",
  "pet-c": "mochi",
  "pet-d": "fenn",
  "pet-e": "bloop",
  "pet-f": "pip",
  "pet-g": "cato",
  "pet-h": "otto",
  "pet-i": "mochi",
  "pet-j": "fenn",
  "pet-k": "bloop",
  "pet-l": "pip",
} as const;
export const PLAYGROUND_PET_ENTITY_IDS = Object.keys(
  PLAYGROUND_PET_ASSET_BY_ENTITY_ID,
) as PlaygroundPetEntityId[];

export type PlaygroundPetEntityId = keyof typeof PLAYGROUND_PET_ASSET_BY_ENTITY_ID;

export const FALLBACK_CODEX_PET_SPRITESHEET_URL = "/fallback-pets/bloop/spritesheet.webp";

export function getCodexPetSpritesheetUrl(assetId: string) {
  return `/codex-pets/${assetId}/spritesheet.webp`;
}

export async function loadCodexPetImage(
  assetId: string,
  loadImage: (url: string) => Promise<HTMLImageElement>,
) {
  return await loadImage(getCodexPetSpritesheetUrl(assetId));
}

export async function loadPlaygroundPetAssetCatalog(
  loadImage: (url: string) => Promise<HTMLImageElement> = loadAtlasImage,
): Promise<AssetCatalog> {
  const entries = await Promise.all(
    Object.entries(PLAYGROUND_PET_ASSET_BY_ENTITY_ID).map(
      async ([entityId, assetId]) =>
        [
          entityId,
          await loadCodexPetImage(assetId, loadImage).catch(() =>
            loadImage(FALLBACK_CODEX_PET_SPRITESHEET_URL),
          ),
        ] as const,
    ),
  );

  return Object.fromEntries(entries);
}
