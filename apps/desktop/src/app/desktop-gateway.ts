import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { withDesktopFixtureWorkingDirectories } from "@/app-state/dev-fixtures";
import {
  createEmptyPetsDrivenState,
  parsePetsDrivenState,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";
import { CODEX_PET_ASSETS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";

export type CodexPetPackage = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

/**
 * Thin gateway over the Tauri commands the app shell and onboarding need.
 * Components receive this via props so tests can inject fakes without
 * mocking @tauri-apps/api.
 */
export type DesktopGateway = {
  readPetsDrivenState(): Promise<PetsDrivenState>;
  writePetsDrivenState(state: PetsDrivenState): Promise<void>;
  listPetPackages(): Promise<CodexPetPackage[]>;
  openAdoptedPetWindow(petId: string, assetId: string): Promise<void>;
  /** Open the OS folder picker; null when cancelled or outside Tauri. */
  pickDirectory(): Promise<string | null>;
};

function withDevFixtures(state: PetsDrivenState): PetsDrivenState {
  return import.meta.env.DEV
    ? withDesktopFixtureWorkingDirectories(state)
    : state;
}

export const desktopGateway: DesktopGateway = {
  async readPetsDrivenState() {
    if (!isTauri()) {
      return withDevFixtures(createEmptyPetsDrivenState());
    }

    const raw = await invoke<unknown>("read_pets_driven_state");

    return withDevFixtures(parsePetsDrivenState(raw));
  },

  async writePetsDrivenState(state) {
    if (!isTauri()) {
      return;
    }

    await invoke("write_pets_driven_state", { state });
  },

  async listPetPackages() {
    if (isTauri()) {
      return await invoke<CodexPetPackage[]>("list_codex_pet_packages");
    }

    return CODEX_PET_ASSETS.map((asset) => ({
      id: asset.id,
      displayName: asset.displayName,
      description: asset.description,
      spritesheetPath: asset.spritesheetPath,
    }));
  },

  async openAdoptedPetWindow(petId, assetId) {
    if (!isTauri()) {
      return;
    }

    await invoke("open_adopted_pet_window", { petId, assetId });
  },

  async pickDirectory() {
    if (!isTauri()) {
      return null;
    }

    const selection = await open({ directory: true, multiple: false });

    return typeof selection === "string" ? selection : null;
  },
};
