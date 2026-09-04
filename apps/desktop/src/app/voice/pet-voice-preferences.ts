import { useCallback, useState } from "react";
import { PET_VOICE_STORAGE_KEY } from "@/app/local-settings-storage";

export type PetVoicePreferences = {
  muted: boolean;
  volume: number;
};

const DEFAULT_PREFERENCES: PetVoicePreferences = {
  muted: false,
  volume: 0.7,
};

type StoredPetVoicePreferences = PetVoicePreferences & { version: 1 };

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export function readPetVoicePreferences(): PetVoicePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PET_VOICE_STORAGE_KEY) ?? "null",
    ) as Partial<StoredPetVoicePreferences> | null;
    if (parsed?.version !== 1) return DEFAULT_PREFERENCES;
    return {
      muted: parsed.muted === true,
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? clampVolume(parsed.volume)
          : DEFAULT_PREFERENCES.volume,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function storePetVoicePreferences(preferences: PetVoicePreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PET_VOICE_STORAGE_KEY,
    JSON.stringify({ version: 1, ...preferences } satisfies StoredPetVoicePreferences),
  );
}

export function usePetVoicePreferences() {
  const [preferences, setPreferences] = useState(readPetVoicePreferences);

  const update = useCallback((patch: Partial<PetVoicePreferences>) => {
    setPreferences((current) => {
      const next = {
        muted: patch.muted ?? current.muted,
        volume: patch.volume === undefined ? current.volume : clampVolume(patch.volume),
      };
      storePetVoicePreferences(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PET_VOICE_STORAGE_KEY);
    }
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  return { preferences, update, reset };
}
