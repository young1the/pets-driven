import { useCallback, useEffect, useState } from "react";
import { PET_OVERLAY_MODE_STORAGE_KEY } from "@/app/local-settings-storage";

/**
 * How the pets are put on the desktop.
 *
 * - `window-per-pet` — each pet owns a small always-on-top OS window that the
 *   shell moves as it walks. The original, and still the default: a pet is a
 *   real window, so it layers against other windows individually and never
 *   covers anything it is not standing on.
 * - `single-window` — one transparent, click-through window over the whole
 *   desktop, with every pet drawn inside it. One webview instead of a dozen and
 *   one event per tick instead of one per pet, so a large roster costs what a
 *   single pet costs; the trade is that all the pets share one z-order and the
 *   host has to decide, from where the cursor is, when the window may take the
 *   mouse at all.
 */
export type PetOverlayMode = "window-per-pet" | "single-window";

export const DEFAULT_PET_OVERLAY_MODE: PetOverlayMode = "window-per-pet";

const PET_OVERLAY_MODES: readonly PetOverlayMode[] = ["window-per-pet", "single-window"];

function isPetOverlayMode(value: unknown): value is PetOverlayMode {
  return typeof value === "string" && PET_OVERLAY_MODES.includes(value as PetOverlayMode);
}

/** The stored mode, or the default outside a browser and for anything unknown. */
export function readPetOverlayMode(): PetOverlayMode {
  if (typeof window === "undefined") {
    return DEFAULT_PET_OVERLAY_MODE;
  }

  try {
    const stored = window.localStorage.getItem(PET_OVERLAY_MODE_STORAGE_KEY);

    return isPetOverlayMode(stored) ? stored : DEFAULT_PET_OVERLAY_MODE;
  } catch {
    return DEFAULT_PET_OVERLAY_MODE;
  }
}

/**
 * The mode, and a setter that persists it.
 *
 * Frontend-owned like the theme and the language rather than a field in the
 * state document, because it describes this machine's screen — a roster synced
 * to another desktop has no use for it — and because "reset all settings" then
 * clears it through the same registry the rest of them use.
 */
export function usePetOverlayMode() {
  const [mode, setModeState] = useState<PetOverlayMode>(readPetOverlayMode);

  const setMode = useCallback((next: PetOverlayMode) => {
    setModeState(next);

    try {
      window.localStorage.setItem(PET_OVERLAY_MODE_STORAGE_KEY, next);
    } catch {
      // A blocked localStorage still leaves the mode live for this run.
    }
  }, []);

  // "Reset all settings" clears the key underneath us, so follow the storage
  // back to the default instead of holding a mode nothing is persisting.
  useEffect(() => {
    function syncFromStorage() {
      setModeState(readPetOverlayMode());
    }

    window.addEventListener("storage", syncFromStorage);

    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const reset = useCallback(() => setModeState(DEFAULT_PET_OVERLAY_MODE), []);

  return { mode, setMode, reset };
}
