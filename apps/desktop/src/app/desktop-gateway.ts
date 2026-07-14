import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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

export type ClaudePluginState = "cli-missing" | "not-installed" | "installed" | "error";

/** Install state of the bundled Claude Code plugin, as reported by the CLI. */
export type ClaudePluginStatus = {
  state: ClaudePluginState;
  version: string | null;
  error: string | null;
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
  /** The Petdex default pet folder (~/.petdex/pets); null outside Tauri. */
  getDefaultPetSourceDirectory(): Promise<string | null>;
  getClaudePluginStatus(): Promise<ClaudePluginStatus>;
  installClaudePlugin(): Promise<ClaudePluginStatus>;
  uninstallClaudePlugin(): Promise<ClaudePluginStatus>;
};

const CLAUDE_PLUGIN_UNAVAILABLE: ClaudePluginStatus = {
  state: "cli-missing",
  version: null,
  error: null,
};

export const desktopGateway: DesktopGateway = {
  async readPetsDrivenState() {
    if (!isTauri()) {
      return createEmptyPetsDrivenState();
    }

    const raw = await invoke<unknown>("read_pets_driven_state");

    return parsePetsDrivenState(raw);
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

  async getDefaultPetSourceDirectory() {
    if (!isTauri()) {
      return null;
    }

    try {
      return await invoke<string>("get_default_pet_source_directory");
    } catch {
      return null;
    }
  },

  async getClaudePluginStatus() {
    if (!isTauri()) {
      return CLAUDE_PLUGIN_UNAVAILABLE;
    }

    return await invoke<ClaudePluginStatus>("get_claude_plugin_status");
  },

  async installClaudePlugin() {
    if (!isTauri()) {
      return CLAUDE_PLUGIN_UNAVAILABLE;
    }

    return await invoke<ClaudePluginStatus>("install_claude_plugin");
  },

  async uninstallClaudePlugin() {
    if (!isTauri()) {
      return CLAUDE_PLUGIN_UNAVAILABLE;
    }

    return await invoke<ClaudePluginStatus>("uninstall_claude_plugin");
  },
};
