import { getCodexPetSpritesheetUrl } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type PetWindowSpritesheetUrl = {
  url: string;
  dispose: () => void;
};

/**
 * Invoked directly rather than through `desktopGateway`: the gateway is the
 * main window's whole command surface, and reaching it from here would pull the
 * roster state, dialogs and agent-event adapters into the lean overlay bundle
 * that every pet webview loads.
 */
async function loadPetSpritesheetBytes(assetId: string): Promise<ArrayBuffer> {
  const response = await invoke<ArrayBuffer | Uint8Array | number[]>("load_codex_pet_spritesheet", {
    assetId,
  });

  return response instanceof ArrayBuffer ? response : new Uint8Array(response).buffer;
}

export async function loadPetWindowSpritesheetUrl(
  assetId: string,
): Promise<PetWindowSpritesheetUrl> {
  if (!isTauri()) {
    return {
      url: getCodexPetSpritesheetUrl(assetId),
      dispose: () => {},
    };
  }

  const bytes = await loadPetSpritesheetBytes(assetId);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));

  return {
    url: objectUrl,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}
