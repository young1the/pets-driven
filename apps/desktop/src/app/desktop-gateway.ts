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
  closeAdoptedPetWindow(petId: string): Promise<void>;
  openPetContextMenu(
    petId: string,
    petName: string,
    note: string,
    x: number,
    y: number,
  ): Promise<void>;
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

    const storable = {
      ...state,
      pets: state.pets.map(({ visible: _, ...pet }) => pet),
    };

    await invoke("write_pets_driven_state", { state: storable });
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

  async closeAdoptedPetWindow(petId) {
    if (!isTauri()) {
      return;
    }

    await invoke("close_adopted_pet_window", { petId });
  },

  async openPetContextMenu(petId, petName, note, x, y) {
    if (!isTauri()) {
      return;
    }

    const url = `index.html?surface=pet-context-menu&petId=${encodeURIComponent(petId)}&petName=${encodeURIComponent(petName)}&note=${encodeURIComponent(note)}`;
    await invoke("open_pet_context_menu", { petId, url, localX: x, localY: y });
  },

  async pickDirectory() {
    if (!isTauri()) {
      return null;
    }

    const selection = await open({ directory: true, multiple: false });

    return typeof selection === "string" ? selection : null;
  },
};
