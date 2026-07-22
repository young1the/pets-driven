import { CODEX_PET_ASSETS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CLAUDE_HOOK_INGRESS_EVENT,
  type ClaudeHookIngressStatus,
} from "@/adapters/agent-events/claude-hook-ingress";
import {
  PETS_DRIVEN_PET_COMMAND_EVENT,
  PETS_DRIVEN_STATE_CHANGED_EVENT,
  type PetCommandEvent,
} from "@/adapters/agent-events/hatch-ingress";
import {
  createEmptyPetsDrivenState,
  type PetsDrivenState,
  parsePetsDrivenState,
} from "@/app-state/pets-driven-state";

/** Unsubscribe handle returned by the gateway's event subscriptions. */
export type Unsubscribe = () => void;

const NOOP_UNSUBSCRIBE: Unsubscribe = () => {};

// Embedded-terminal PTY channel. These names and payload shapes mirror the
// Rust side in embedded_terminal.rs; `data` arrives as a JSON array of bytes.
const TERMINAL_DATA_EVENT = "embedded-terminal-data";
const TERMINAL_EXIT_EVENT = "embedded-terminal-exit";

export type TerminalDataEvent = { id: string; data: number[] };
export type TerminalExitEvent = { id: string };

export type TerminalOpenOptions = {
  /** Working directory to spawn the shell in; null uses the process default. */
  cwd?: string | null;
  /** Program to run; null falls back to COMSPEC/SHELL in Rust. */
  shell?: string | null;
  cols: number;
  rows: number;
};

/** A foreign OS window a pet is bound to. Mirrors the Rust `ForeignWindow`. */
export type ForeignWindow = { hwnd: number; title: string };

export type CodexPetPackage = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

/** A selectable shell for the in-app terminal. Mirrors the Rust `TerminalShellOption`. */
export type TerminalShellOption = { label: string; path: string };

export type ClaudePluginState = "cli-missing" | "not-installed" | "installed" | "error";

/** Install state of the bundled Claude Code plugin, as reported by the CLI. */
export type ClaudePluginStatus = {
  state: ClaudePluginState;
  version: string | null;
  error: string | null;
};

/**
 * What to run in the in-app terminal to install or remove the plugin. `line` is
 * null when preparation already failed, in which case `status` carries the why.
 */
export type ClaudePluginPlan = {
  line: string | null;
  status: ClaudePluginStatus;
};

export type ClaudePluginAction = "install" | "uninstall";

/**
 * Thin gateway over the Tauri commands the app shell and onboarding need.
 * Components receive this via props so tests can inject fakes without
 * mocking @tauri-apps/api.
 */
export type DesktopGateway = {
  readPetsDrivenState(): Promise<PetsDrivenState>;
  writePetsDrivenState(state: PetsDrivenState): Promise<void>;
  listPetPackages(): Promise<CodexPetPackage[]>;
  /** Shells the in-app terminal can spawn, detected from the system. Empty outside Tauri. */
  listTerminalShells(): Promise<TerminalShellOption[]>;
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
  /** Resolve the `claude` line to run in the terminal for an install/uninstall. */
  planClaudePluginCommand(action: ClaudePluginAction): Promise<ClaudePluginPlan>;
  installClaudePlugin(): Promise<ClaudePluginStatus>;
  uninstallClaudePlugin(): Promise<ClaudePluginStatus>;

  /** Whether we're running inside the Tauri desktop shell (vs. browser/tests). */
  isDesktopRuntime(): boolean;

  /** Current status of the Claude hook ingress listener. */
  getClaudeHookIngressStatus(): Promise<ClaudeHookIngressStatus>;
  /** Close every open pet overlay window. */
  closeAllPetWindows(): Promise<void>;
  /**
   * Move a whole frame's worth of pet windows in one shell call. The pet
   * windows do not place themselves — see place_pet_windows in pet_windows.rs.
   * Resolves with the pets whose window did not exist yet, which the caller
   * must place again once it does.
   */
  placePetWindows(
    placements: ReadonlyArray<{ petId: string; x: number; y: number }>,
  ): Promise<string[]>;

  /** Raw spritesheet bytes for an installed pet asset (Tauri only). */
  loadPetSpritesheet(assetId: string): Promise<ArrayBuffer>;

  // Terminal-session windows: a pet's bound external terminal window.
  /** Focus the bound foreign window; false when it no longer exists. */
  focusForeignWindow(hwnd: number): Promise<boolean>;
  /** Launch a new terminal session in `cwd` and return its window, if any. */
  startSession(cwd: string, command: string): Promise<ForeignWindow | null>;
  /** Let the user pick an existing window to bind; null when cancelled. */
  connectForeignWindow(): Promise<ForeignWindow | null>;

  // App-level event subscriptions. Each resolves to an unsubscribe handle;
  // outside Tauri they subscribe to nothing and the handle is a no-op. The
  // handler receives the domain payload directly, never a Tauri Event wrapper.
  subscribeClaudeHookIngress(handler: (payload: unknown) => void): Promise<Unsubscribe>;
  subscribePetsDrivenStateChanged(handler: () => void): Promise<Unsubscribe>;
  subscribePetCommand(handler: (event: PetCommandEvent) => void): Promise<Unsubscribe>;

  // Embedded terminal (PTY) channel.
  openTerminal(options: TerminalOpenOptions): Promise<string>;
  writeTerminal(id: string, data: string): Promise<void>;
  resizeTerminal(id: string, cols: number, rows: number): Promise<void>;
  closeTerminal(id: string): Promise<void>;
  subscribeTerminalData(handler: (event: TerminalDataEvent) => void): Promise<Unsubscribe>;
  subscribeTerminalExit(handler: (event: TerminalExitEvent) => void): Promise<Unsubscribe>;
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

  async listTerminalShells() {
    if (!isTauri()) {
      return [];
    }

    return await invoke<TerminalShellOption[]>("list_terminal_shells");
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

    // Shares the pet windows' lean overlay entry — see pet-window-main.tsx.
    const url = `pet-window.html?surface=pet-context-menu&petId=${encodeURIComponent(petId)}&petName=${encodeURIComponent(petName)}&note=${encodeURIComponent(note)}`;
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

  async planClaudePluginCommand(action: ClaudePluginAction) {
    if (!isTauri()) {
      return { line: null, status: CLAUDE_PLUGIN_UNAVAILABLE };
    }

    return await invoke<ClaudePluginPlan>("plan_claude_plugin_command", { action });
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

  isDesktopRuntime() {
    return isTauri();
  },

  async getClaudeHookIngressStatus() {
    if (!isTauri()) {
      return { url: "", state: "error", error: null };
    }

    return await invoke<ClaudeHookIngressStatus>("get_claude_hook_ingress_status");
  },

  async closeAllPetWindows() {
    if (!isTauri()) {
      return;
    }

    await invoke("close_all_pet_windows");
  },

  async placePetWindows(placements) {
    if (!isTauri() || placements.length === 0) {
      return [];
    }

    return (await invoke<string[] | undefined>("place_pet_windows", { placements })) ?? [];
  },

  async loadPetSpritesheet(assetId) {
    if (!isTauri()) {
      throw new Error("Pet spritesheet bytes require the Tauri desktop shell.");
    }

    const response = await invoke<ArrayBuffer | Uint8Array | number[]>(
      "load_codex_pet_spritesheet",
      {
        assetId,
      },
    );

    if (response instanceof ArrayBuffer) {
      return response;
    }

    return new Uint8Array(response).buffer;
  },

  async focusForeignWindow(hwnd) {
    if (!isTauri()) {
      return false;
    }

    return await invoke<boolean>("focus_window", { hwnd });
  },

  async startSession(cwd, command) {
    if (!isTauri()) {
      return null;
    }

    return await invoke<ForeignWindow | null>("start_session", { cwd, command });
  },

  async connectForeignWindow() {
    if (!isTauri()) {
      return null;
    }

    return await invoke<ForeignWindow | null>("connect_window");
  },

  async subscribeClaudeHookIngress(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<unknown>(CLAUDE_HOOK_INGRESS_EVENT, (event) => handler(event.payload));
  },

  async subscribePetsDrivenStateChanged(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen(PETS_DRIVEN_STATE_CHANGED_EVENT, () => handler());
  },

  async subscribePetCommand(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<PetCommandEvent>(PETS_DRIVEN_PET_COMMAND_EVENT, (event) =>
      handler(event.payload),
    );
  },

  async openTerminal(options) {
    if (!isTauri()) {
      throw new Error("Embedded terminal requires the Tauri desktop shell.");
    }

    return await invoke<string>("terminal_open", {
      cwd: options.cwd ?? null,
      shell: options.shell ?? null,
      cols: options.cols,
      rows: options.rows,
    });
  },

  async writeTerminal(id, data) {
    if (!isTauri()) {
      return;
    }

    await invoke("terminal_write", { id, data });
  },

  async resizeTerminal(id, cols, rows) {
    if (!isTauri()) {
      return;
    }

    await invoke("terminal_resize", { id, cols, rows });
  },

  async closeTerminal(id) {
    if (!isTauri()) {
      return;
    }

    await invoke("terminal_close", { id });
  },

  async subscribeTerminalData(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<TerminalDataEvent>(TERMINAL_DATA_EVENT, (event) => handler(event.payload));
  },

  async subscribeTerminalExit(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<TerminalExitEvent>(TERMINAL_EXIT_EVENT, (event) => handler(event.payload));
  },
};
