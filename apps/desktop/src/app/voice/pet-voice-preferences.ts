import { useCallback, useState } from "react";
import { PET_VOICE_STORAGE_KEY } from "@/app/local-settings-storage";

export type PetVoicePreferences = {
  muted: boolean;
  volume: number;
  speakTaskStarted: boolean;
  speakIdle: boolean;
  speakSocial: boolean;
};

const DEFAULT_PREFERENCES: PetVoicePreferences = {
  muted: false,
  volume: 0.7,
  speakTaskStarted: false,
  speakIdle: false,
  speakSocial: false,
};

type StoredPetVoicePreferencesV1 = Pick<PetVoicePreferences, "muted" | "volume"> & {
  version: 1;
};
type StoredPetVoicePreferences = PetVoicePreferences & { version: 2 };

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export function readPetVoicePreferences(): PetVoicePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PET_VOICE_STORAGE_KEY) ?? "null",
    ) as Partial<StoredPetVoicePreferences | StoredPetVoicePreferencesV1> | null;
    if (parsed?.version !== 1 && parsed?.version !== 2) return DEFAULT_PREFERENCES;
    return {
      muted: parsed.muted === true,
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? clampVolume(parsed.volume)
          : DEFAULT_PREFERENCES.volume,
      speakTaskStarted: parsed.version === 2 && parsed.speakTaskStarted === true,
      speakIdle: parsed.version === 2 && parsed.speakIdle === true,
      speakSocial: parsed.version === 2 && parsed.speakSocial === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function storePetVoicePreferences(preferences: PetVoicePreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PET_VOICE_STORAGE_KEY,
    JSON.stringify({ version: 2, ...preferences } satisfies StoredPetVoicePreferences),
  );
}

export function usePetVoicePreferences() {
  const [preferences, setPreferences] = useState(readPetVoicePreferences);

  const update = useCallback((patch: Partial<PetVoicePreferences>) => {
    setPreferences((current) => {
      const next = {
        ...current,
        ...patch,
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
