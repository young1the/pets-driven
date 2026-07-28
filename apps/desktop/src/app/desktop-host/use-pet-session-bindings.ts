import { emitTo } from "@tauri-apps/api/event";
import { type MutableRefObject, useRef } from "react";
import { desktopGateway, type ForeignWindow } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";
import type { PetOverlayMode } from "@/app/pet-overlay-mode";
import type { PetsDrivenState } from "@/app-state/pets-driven-state";
import { PET_OVERLAY_LABEL } from "@/pet-window/pet-overlay-messages";
import {
  PET_WINDOW_BINDING_EVENT,
  type PetWindowBindingEvent,
  petWindowLabel,
} from "@/pet-window/pet-window-messages";

type UsePetSessionBindingsParams = {
  stateRef: MutableRefObject<PetsDrivenState>;
  setPetWindowError: (message: string | null) => void;
  /** Which window a pet's badge lives in — its own, or the one they all share. */
  overlayMode: PetOverlayMode;
};

/**
 * A pet's bound external terminal window: starting/connecting/focusing a
 * session and keeping each pet window's binding badge in sync. Owns the
 * in-memory binding and launch-guard maps; the host drives these from the
 * pet-window input stream.
 */
export function usePetSessionBindings({
  stateRef,
  setPetWindowError,
  overlayMode,
}: UsePetSessionBindingsParams) {
  // petId -> the window this pet is bound to. In-memory only; HWNDs go stale
  // across restarts, so a dead focus just clears the binding.
  const windowBindingsRef = useRef<Map<string, ForeignWindow>>(new Map());
  // Pets with a session launch in flight. Binding is only set after the ~3s
  // bind poll resolves, so without this guard a second interaction during that
  // window would spawn a duplicate terminal.
  const launchingPetIdsRef = useRef<Set<string>>(new Set());

  function cwdForPet(petId: string): string | null {
    const directory = stateRef.current.registeredWorkingDirectories.find(
      (candidate) => candidate.petId === petId,
    );
    return directory ? directory.path : null;
  }

  // Push the pet's current binding (title or null) to its window so its badge,
  // menu, and bubble stay in sync with what the host actually holds.
  function emitBindingState(petId: string, isLoading = false, isConnecting = false) {
    const binding = windowBindingsRef.current.get(petId) ?? null;
    // Every pet in the shared window listens on the same label and drops what
    // is not addressed to it, the way each pet window already does.
    const label = overlayMode === "single-window" ? PET_OVERLAY_LABEL : petWindowLabel(petId);
    void emitTo(label, PET_WINDOW_BINDING_EVENT, {
      petId,
      title: binding ? binding.title : null,
      isLoading,
      ...(isConnecting ? { isConnecting } : {}),
    } satisfies PetWindowBindingEvent);
  }

  function setBinding(petId: string, window: ForeignWindow | null) {
    if (window) {
      windowBindingsRef.current.set(petId, window);
    } else {
      windowBindingsRef.current.delete(petId);
    }
    emitBindingState(petId);
  }

  // Double-click: focus the bound window, or start a new session when no live
  // binding exists.
  async function focusOrStartSessionForPet(petId: string) {
    const binding = windowBindingsRef.current.get(petId);
    if (!binding) {
      await startSessionForPet(petId);
      return;
    }
    try {
      if (await desktopGateway.focusForeignWindow(binding.hwnd)) {
        return;
      }
    } catch {
      // Window vanished.
    }
    setBinding(petId, null);
    await startSessionForPet(petId);
  }

  // Start a session and auto-bind to the window it launches.
  async function startSessionForPet(petId: string) {
    if (launchingPetIdsRef.current.has(petId)) {
      return;
    }
    const cwd = cwdForPet(petId);
    if (!cwd) {
      emitBindingState(petId);
      return;
    }
    launchingPetIdsRef.current.add(petId);
    emitBindingState(petId, true);
    try {
      const launched = await desktopGateway.startSession(cwd, stateRef.current.sessionCommand);
      if (launched) {
        setBinding(petId, launched);
      } else {
        emitBindingState(petId);
      }
    } catch (error) {
      emitBindingState(petId);
      setPetWindowError(formatCommandError(error));
    } finally {
      launchingPetIdsRef.current.delete(petId);
    }
  }

  // Connect mode: the user picks an existing window (click, Alt-Tab) and it
  // becomes this pet's bound terminal window.
  async function connectTerminalForPet(petId: string) {
    if (launchingPetIdsRef.current.has(petId)) {
      return;
    }
    launchingPetIdsRef.current.add(petId);
    emitBindingState(petId, true, true);
    try {
      const picked = await desktopGateway.connectForeignWindow();
      if (picked) {
        setBinding(petId, picked);
      } else {
        emitBindingState(petId);
      }
    } catch (error) {
      emitBindingState(petId);
      setPetWindowError(formatCommandError(error));
    } finally {
      launchingPetIdsRef.current.delete(petId);
    }
  }

  function unbindPet(petId: string) {
    setBinding(petId, null);
  }

  return {
    cwdForPet,
    emitBindingState,
    setBinding,
    focusOrStartSessionForPet,
    startSessionForPet,
    connectTerminalForPet,
    unbindPet,
  };
}
