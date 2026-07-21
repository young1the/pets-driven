import { getCodexPetSpritesheetUrl } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { desktopGateway } from "@/app/desktop-gateway";

export type PetWindowSpritesheetUrl = {
  url: string;
  dispose: () => void;
};

export async function loadPetWindowSpritesheetUrl(
  assetId: string,
): Promise<PetWindowSpritesheetUrl> {
  if (!desktopGateway.isDesktopRuntime()) {
    return {
      url: getCodexPetSpritesheetUrl(assetId),
      dispose: () => {},
    };
  }

  const bytes = await desktopGateway.loadPetSpritesheet(assetId);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));

  return {
    url: objectUrl,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}
