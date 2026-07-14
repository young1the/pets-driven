import { getCodexPetSpritesheetUrl } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type PetWindowSpritesheetUrl = {
  url: string;
  dispose: () => void;
};

export async function loadPetWindowSpritesheetUrl(
  assetId: string,
): Promise<PetWindowSpritesheetUrl> {
  if (!isTauri()) {
    return {
      url: getCodexPetSpritesheetUrl(assetId),
      dispose: () => {},
    };
  }

  const bytes = await loadPetWindowSpritesheetBytes(assetId);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));

  return {
    url: objectUrl,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

async function loadPetWindowSpritesheetBytes(assetId: string) {
  const response = await invoke<ArrayBuffer | Uint8Array | number[]>("load_codex_pet_spritesheet", {
    assetId,
  });

  if (response instanceof ArrayBuffer) {
    return response;
  }

  return new Uint8Array(response).buffer;
}
