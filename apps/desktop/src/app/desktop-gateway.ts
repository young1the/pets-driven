import { CODEX_PET_ASSETS } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AGENT_HOOK_INGRESS_EVENT,
  type AgentHookIngressEvent,
  type AgentHookIngressStatus,
  isAgentHookIngressEvent,
} from "@/adapters/agent-events/agent-hook-ingress";
import {
  PETS_DRIVEN_PET_COMMAND_EVENT,
  PETS_DRIVEN_STATE_CHANGED_EVENT,
  type PetCommandEvent,
} from "@/adapters/agent-events/hatch-ingress";
import {
  createEmptyPetsDrivenState,
  type PetAgentProvider,
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

/**
 * A well-known pet folder the onboarding dropdown offers. `kind` is a stable
 * identifier the frontend maps to a translated label; `path` is the resolved
 * absolute directory. Mirrors the Rust `PetSourceDirectoryOption`.
 */
export type PetSourceDirectoryOption = { kind: "petdex" | "codex"; path: string };

export type AgentPluginProvider = "claude" | "codex";
export type AgentPluginState = "cli-missing" | "not-installed" | "installed" | "error";

/** Install state of a bundled agent plugin, as reported by the provider CLI. */
export type AgentPluginStatus = {
  state: AgentPluginState;
  version: string | null;
  error: string | null;
};

/**
 * What to run in the in-app terminal to install or remove the plugin. `line` is
 * null when preparation already failed, in which case `status` carries the why.
 */
export type AgentPluginPlan = {
  line: string | null;
  status: AgentPluginStatus;
};

export type AgentPluginAction = "install" | "uninstall";

/** Release metadata returned by the native updater after signature-aware checking. */
export type AppUpdateInfo = {
  currentVersion: string;
  version: string;
  notes: string | null;
  date: string | null;
};

/** Download lifecycle events emitted by the native updater command. */
export type AppUpdateEvent = {
  event: "started" | "progress" | "finished";
  contentLength?: number | null;
  chunkLength?: number | null;
};

/**
 * Thin gateway over the Tauri commands the app shell and onboarding need.
 * Components receive this via props so tests can inject fakes without
 * mocking @tauri-apps/api.
 */
export type DesktopGateway = {
  /** The packaged application version; null in the browser playground. */
  getAppVersion(): Promise<string | null>;
  /** Check the signed release feed, returning null when this build is current. */
  checkAppUpdate(): Promise<AppUpdateInfo | null>;
  /** Download, verify, and install the version that the user just approved. */
  installAppUpdate(
    expectedVersion: string,
    onEvent: (event: AppUpdateEvent) => void,
  ): Promise<void>;
  readPetsDrivenState(): Promise<PetsDrivenState>;
  /**
   * Replace the persisted state with this whole document. Last-writer-wins, so
   * it is only for flows that own the entire document (the Settings reset).
   * Everything else sends an intent through the four mutations below, which the
   * backend applies to whatever is on disk — see `state_store.rs`.
   */
  writePetsDrivenState(state: PetsDrivenState): Promise<void>;
  /**
   * Adopt a pet, optionally bound to `cwd`. Resolves to the persisted state, or
   * null outside Tauri, where the caller keeps its in-memory copy.
   */
  hatchPet(input: {
    assetId: string;
    name: string;
    personalityId: string;
    cwd: string | null;
  }): Promise<PetsDrivenState | null>;
  /** Patch one pet. Omitted fields are left as they are on disk. */
  updatePet(input: {
    petId: string;
    name?: string;
    /** Re-skin the pet to another installed Pet Asset. */
    assetId?: string;
    personalityId?: string;
    archived?: boolean;
    note?: string;
    scale?: number;
    /** Trade the pet's two directional running rows for one another. */
    swapRunningDirections?: boolean;
    /** The agent this pet's session opens; null unsets it. */
    agentProvider?: PetAgentProvider | null;
    /** A path re-binds the pet to that folder, null detaches it. */
    cwd?: string | null;
  }): Promise<PetsDrivenState | null>;
  deletePet(petId: string): Promise<PetsDrivenState | null>;
  /** Patch the app-wide settings. Omitted fields are left as they are on disk. */
  updateSettings(input: {
    sessionCommand?: string;
    terminalShell?: string | null;
    petSourceDirectory?: string | null;
  }): Promise<PetsDrivenState | null>;
  /**
   * Put every persisted setting back to its default. The backend decides what
   * counts as a setting; the pets, their profiles, and the folders they watch
   * are user data and stay. Frontend-only settings live in localStorage and are
   * cleared separately — see `clearStoredSettings` in app/local-settings-storage.
   */
  resetSettings(): Promise<PetsDrivenState | null>;
  listPetPackages(): Promise<CodexPetPackage[]>;
  /**
   * Pet packages in the designated folder alone — no bundled built-ins. The
   * onboarding pets-folder step uses this so its count reflects the real folder,
   * not the always-present defaults. Empty outside Tauri.
   */
  listDesignatedPetPackages(): Promise<CodexPetPackage[]>;
  /** Shells the in-app terminal can spawn, detected from the system. Empty outside Tauri. */
  listTerminalShells(): Promise<TerminalShellOption[]>;
  openAdoptedPetWindow(petId: string, assetId: string): Promise<void>;
  /**
   * Open several adopted pets' overlay windows in one shell call. "Show all"
   * uses this so a large roster is deployed in a single IPC hop instead of one
   * per pet — see open_adopted_pet_windows in pet_windows.rs. A no-op outside
   * Tauri or when the batch is empty.
   */
  openAdoptedPetWindows(specs: ReadonlyArray<{ petId: string; assetId: string }>): Promise<void>;
  closeAdoptedPetWindow(petId: string): Promise<void>;
  openPetContextMenu(
    petId: string,
    petName: string,
    note: string,
    x: number,
    y: number,
    /** The round this pet is on, so the menu offers to stop it. Absent = none. */
    gameSpawn?: "auto" | "tool-use",
  ): Promise<void>;
  /** Open the OS folder picker; null when cancelled or outside Tauri. */
  pickDirectory(): Promise<string | null>;
  /**
   * Reveal a folder in the OS file manager (Explorer). Rejects when the path no
   * longer exists so the caller can tell the user; a no-op outside Tauri.
   */
  revealPath(path: string): Promise<void>;
  /**
   * Put the tray menu in the user's language. The shell builds that menu before
   * any webview exists, so it starts in the default locale and this is how it
   * learns better; a no-op outside Tauri.
   */
  setTrayLabels(open: string, quit: string): Promise<void>;
  /**
   * The well-known pet folders the onboarding dropdown offers (Petdex and Codex),
   * with their resolved absolute paths. Empty outside Tauri.
   */
  listPetSourceDirectoryOptions(): Promise<PetSourceDirectoryOption[]>;
  /**
   * Copy the pets bundled with the app into the designated pet source folder so
   * they physically live there. Pets already present are left untouched.
   * Resolves with the number of pets newly copied; 0 outside Tauri.
   */
  copyBundledPetsToSourceDirectory(): Promise<number>;
  getClaudePluginStatus(): Promise<AgentPluginStatus>;
  /** Resolve the `claude` line to run in the terminal for an install/uninstall. */
  planClaudePluginCommand(action: AgentPluginAction): Promise<AgentPluginPlan>;
  installClaudePlugin(): Promise<AgentPluginStatus>;
  uninstallClaudePlugin(): Promise<AgentPluginStatus>;
  getCodexPluginStatus(): Promise<AgentPluginStatus>;
  /** Resolve the `codex` line to run in the terminal for an install/uninstall. */
  planCodexPluginCommand(action: AgentPluginAction): Promise<AgentPluginPlan>;
  installCodexPlugin(): Promise<AgentPluginStatus>;
  uninstallCodexPlugin(): Promise<AgentPluginStatus>;

  /** Whether we're running inside the Tauri desktop shell (vs. browser/tests). */
  isDesktopRuntime(): boolean;

  /** Current status of the shared agent hook ingress listener. */
  getClaudeHookIngressStatus(): Promise<AgentHookIngressStatus>;
  /**
   * Post a synthetic hook to our own ingress and resolve with its HTTP status
   * line. It travels the real loopback socket, so a success proves the listener
   * is reachable and routing — the one thing a packaged build, with no console
   * to read, otherwise cannot check.
   */
  sendTestHookEvent(): Promise<string>;
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
  /**
   * Open — or re-fit, when the monitor layout changed — the single window that
   * single-window overlay mode draws every pet inside. The rect is in logical
   * pixels and covers the whole desktop; see petOverlayWindowRect.
   */
  openPetOverlayWindow(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void>;
  /**
   * Hand the mouse to the single-window overlay, or back to the desktop under
   * it. The host decides this from its own hit test — a click-through window is
   * never told where the cursor is, so the overlay cannot answer for itself.
   */
  setPetOverlayInteractive(interactive: boolean): Promise<void>;
  closePetOverlayWindow(): Promise<void>;
  /**
   * Reconcile the trinket overlay windows to exactly this set: new drops get a
   * window, collected or faded ones lose theirs. Unlike pets these carry no
   * frame stream — the window renders from its own URL — so this one call is
   * the whole contract.
   */
  syncItemWindows(
    items: ReadonlyArray<{
      itemId: string;
      kind: string;
      grabbable: boolean;
      x: number;
      y: number;
    }>,
  ): Promise<void>;
  /** Close every open trinket overlay window. */
  closeAllItemWindows(): Promise<void>;

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
  subscribeAgentHookIngress(handler: (event: AgentHookIngressEvent) => void): Promise<Unsubscribe>;
  subscribePetsDrivenStateChanged(handler: () => void): Promise<Unsubscribe>;
  subscribePetCommand(handler: (event: PetCommandEvent) => void): Promise<Unsubscribe>;

  // Embedded terminal (PTY) channel.
  openTerminal(options: TerminalOpenOptions): Promise<string>;
  writeTerminal(id: string, data: string): Promise<void>;
  resizeTerminal(id: string, cols: number, rows: number): Promise<void>;
  closeTerminal(id: string): Promise<void>;
  /** Whether the session's shell is running something rather than idling. */
  isTerminalBusy(id: string): Promise<boolean>;
  subscribeTerminalData(handler: (event: TerminalDataEvent) => void): Promise<Unsubscribe>;
  subscribeTerminalExit(handler: (event: TerminalExitEvent) => void): Promise<Unsubscribe>;
};

const AGENT_PLUGIN_UNAVAILABLE: AgentPluginStatus = {
  state: "cli-missing",
  version: null,
  error: null,
};

/**
 * Run one of the backend's state-mutation commands and parse the state it
 * persisted. Outside Tauri there is no state file at all, so this resolves to
 * null and the caller stays on its in-memory copy.
 */
async function sendStateMutation(
  command: string,
  args: Record<string, unknown>,
): Promise<PetsDrivenState | null> {
  if (!isTauri()) {
    return null;
  }

  return parsePetsDrivenState(await invoke<unknown>(command, args));
}

export const desktopGateway: DesktopGateway = {
  async getAppVersion() {
    if (!isTauri()) {
      return null;
    }

    return await invoke<string>("get_app_version");
  },

  async checkAppUpdate() {
    if (!isTauri()) {
      return null;
    }

    return await invoke<AppUpdateInfo | null>("check_app_update");
  },

  async installAppUpdate(expectedVersion, onEvent) {
    if (!isTauri()) {
      return;
    }

    const eventChannel = new Channel<AppUpdateEvent>();
    eventChannel.onmessage = onEvent;
    await invoke("install_app_update", { expectedVersion, onEvent: eventChannel });
  },

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

  async hatchPet(input) {
    return await sendStateMutation("hatch_pet_record", { input });
  },

  async updatePet(input) {
    return await sendStateMutation("update_pet_record", { input });
  },

  async deletePet(petId) {
    return await sendStateMutation("delete_pet_record", { petId });
  },

  async updateSettings(input) {
    return await sendStateMutation("update_pets_driven_settings", { input });
  },

  async resetSettings() {
    return await sendStateMutation("reset_pets_driven_settings", {});
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

  async listDesignatedPetPackages() {
    if (!isTauri()) {
      return [];
    }

    return await invoke<CodexPetPackage[]>("list_designated_pet_packages");
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

  async openAdoptedPetWindows(specs) {
    if (!isTauri() || specs.length === 0) {
      return;
    }

    await invoke("open_adopted_pet_windows", { specs });
  },

  async closeAdoptedPetWindow(petId) {
    if (!isTauri()) {
      return;
    }

    await invoke("close_adopted_pet_window", { petId });
  },

  async openPetContextMenu(petId, petName, note, x, y, gameSpawn) {
    if (!isTauri()) {
      return;
    }

    // Shares the pet windows' lean overlay entry — see pet-window-main.tsx.
    // `game` names the round this pet is already on, so the menu can offer to
    // stop it rather than showing the same two rows that started it. Without
    // it there is no way to tell from the menu that anything is running.
    const game = gameSpawn ? `&game=${gameSpawn}` : "";
    const url = `pet-window.html?surface=pet-context-menu&petId=${encodeURIComponent(petId)}&petName=${encodeURIComponent(petName)}&note=${encodeURIComponent(note)}${game}`;
    await invoke("open_pet_context_menu", { petId, url, localX: x, localY: y });
  },

  async pickDirectory() {
    if (!isTauri()) {
      return null;
    }

    const selection = await open({ directory: true, multiple: false });

    return typeof selection === "string" ? selection : null;
  },

  async revealPath(path) {
    if (!isTauri()) {
      return;
    }

    await invoke("reveal_path", { path });
  },

  async setTrayLabels(open, quit) {
    if (!isTauri()) {
      return;
    }

    await invoke("set_tray_labels", { open, quit });
  },

  async listPetSourceDirectoryOptions() {
    if (!isTauri()) {
      return [];
    }

    try {
      return await invoke<PetSourceDirectoryOption[]>("list_pet_source_directory_options");
    } catch {
      return [];
    }
  },

  async copyBundledPetsToSourceDirectory() {
    if (!isTauri()) {
      return 0;
    }

    return await invoke<number>("copy_bundled_pets_to_source_directory");
  },

  async getClaudePluginStatus() {
    if (!isTauri()) {
      return AGENT_PLUGIN_UNAVAILABLE;
    }

    return await invoke<AgentPluginStatus>("get_claude_plugin_status");
  },

  async planClaudePluginCommand(action: AgentPluginAction) {
    if (!isTauri()) {
      return { line: null, status: AGENT_PLUGIN_UNAVAILABLE };
    }

    return await invoke<AgentPluginPlan>("plan_claude_plugin_command", { action });
  },

  async installClaudePlugin() {
    if (!isTauri()) {
      return AGENT_PLUGIN_UNAVAILABLE;
    }

    return await invoke<AgentPluginStatus>("install_claude_plugin");
  },

  async uninstallClaudePlugin() {
    if (!isTauri()) {
      return AGENT_PLUGIN_UNAVAILABLE;
    }

    return await invoke<AgentPluginStatus>("uninstall_claude_plugin");
  },

  async getCodexPluginStatus() {
    if (!isTauri()) {
      return AGENT_PLUGIN_UNAVAILABLE;
    }

    return await invoke<AgentPluginStatus>("get_codex_plugin_status");
  },

  async planCodexPluginCommand(action: AgentPluginAction) {
    if (!isTauri()) {
      return { line: null, status: AGENT_PLUGIN_UNAVAILABLE };
    }

    return await invoke<AgentPluginPlan>("plan_codex_plugin_command", { action });
  },

  async installCodexPlugin() {
    if (!isTauri()) {
      return AGENT_PLUGIN_UNAVAILABLE;
    }

    return await invoke<AgentPluginStatus>("install_codex_plugin");
  },

  async uninstallCodexPlugin() {
    if (!isTauri()) {
      return AGENT_PLUGIN_UNAVAILABLE;
    }

    return await invoke<AgentPluginStatus>("uninstall_codex_plugin");
  },

  isDesktopRuntime() {
    return isTauri();
  },

  async getClaudeHookIngressStatus(): Promise<AgentHookIngressStatus> {
    if (!isTauri()) {
      return {
        url: "",
        state: "error",
        error: null,
        lastEventAt: null,
        receivedCount: 0,
        rejectedCount: 0,
        lastEventName: null,
        recent: [],
      };
    }

    return await invoke<AgentHookIngressStatus>("get_claude_hook_ingress_status");
  },

  async sendTestHookEvent(): Promise<string> {
    if (!isTauri()) {
      throw new Error("The hook ingress self-test is only available in the desktop app.");
    }

    return await invoke<string>("send_test_claude_hook_ingress_event", {});
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

  async openPetOverlayWindow(rect) {
    if (!isTauri()) {
      return;
    }

    await invoke("open_pet_overlay_window", rect);
  },

  async setPetOverlayInteractive(interactive) {
    if (!isTauri()) {
      return;
    }

    await invoke("set_pet_overlay_interactive", { interactive });
  },

  async closePetOverlayWindow() {
    if (!isTauri()) {
      return;
    }

    await invoke("close_pet_overlay_window");
  },

  async syncItemWindows(items) {
    if (!isTauri()) {
      return;
    }

    // No early return on an empty list: an empty set is the call that tears
    // down the last trinket's window once a pet has taken it.
    await invoke("sync_item_windows", { items });
  },

  async closeAllItemWindows() {
    if (!isTauri()) {
      return;
    }

    await invoke("close_all_item_windows");
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

  async subscribeAgentHookIngress(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<unknown>(AGENT_HOOK_INGRESS_EVENT, (event) => {
      if (isAgentHookIngressEvent(event.payload)) {
        handler(event.payload);
      }
    });
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

  async isTerminalBusy(id) {
    if (!isTauri()) {
      return false;
    }

    return await invoke<boolean>("terminal_is_busy", { id });
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
