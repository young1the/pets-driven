import type { QuietMode } from "@pets-driven/pet-engine/core/quiet-mode";
import { DEFAULT_QUIET_MODE } from "@pets-driven/pet-engine/core/quiet-mode";
import { useCallback, useEffect, useState } from "react";
import { QUIET_MODE_STORAGE_KEY } from "@/app/local-settings-storage";

/**
 * How much the pets may intrude, as the user's setting.
 *
 * The levels themselves belong to the engine (`core/quiet-mode.ts`) — it is the
 * simulation that stops speaking and stops walking. This module owns only the
 * user's answer: where it is kept, and how the app reads it back.
 *
 * Frontend-owned like the theme and the pet window mode, and for the same
 * reason: it describes this desk at this moment ("I am sharing my screen"), not
 * something a roster synced to another machine should inherit.
 */
export type { QuietMode };

export const QUIET_MODES: readonly QuietMode[] = ["off", "quiet", "still"];

function isQuietMode(value: unknown): value is QuietMode {
  return typeof value === "string" && QUIET_MODES.includes(value as QuietMode);
}

/** The stored level, or the default outside a browser and for anything unknown. */
export function readQuietMode(): QuietMode {
  if (typeof window === "undefined") {
    return DEFAULT_QUIET_MODE;
  }

  try {
    const stored = window.localStorage.getItem(QUIET_MODE_STORAGE_KEY);

    return isQuietMode(stored) ? stored : DEFAULT_QUIET_MODE;
  } catch {
    return DEFAULT_QUIET_MODE;
  }
}

/** The level, and a setter that persists it. */
export function useQuietMode() {
  const [mode, setModeState] = useState<QuietMode>(readQuietMode);

  const setMode = useCallback((next: QuietMode) => {
    setModeState(next);

    try {
      window.localStorage.setItem(QUIET_MODE_STORAGE_KEY, next);
    } catch {
      // A blocked localStorage still leaves the level live for this run.
    }
  }, []);

  // "Reset all settings" clears the key underneath us, so follow the storage
  // back to the default instead of holding a level nothing is persisting.
  useEffect(() => {
    function syncFromStorage() {
      setModeState(readQuietMode());
    }

    window.addEventListener("storage", syncFromStorage);

    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const reset = useCallback(() => setModeState(DEFAULT_QUIET_MODE), []);

  return { mode, setMode, reset };
}
