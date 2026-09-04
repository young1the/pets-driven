import { beforeEach, describe, expect, it } from "vitest";
import { PET_VOICE_STORAGE_KEY } from "@/app/local-settings-storage";
import { readPetVoicePreferences } from "@/app/voice/pet-voice-preferences";

describe("pet voice preferences", () => {
  beforeEach(() => window.localStorage.removeItem(PET_VOICE_STORAGE_KEY));

  it("defaults to audible speech at a comfortable volume", () => {
    expect(readPetVoicePreferences()).toEqual({ muted: false, volume: 0.7 });
  });

  it("loads and clamps a versioned device-local preference", () => {
    window.localStorage.setItem(
      PET_VOICE_STORAGE_KEY,
      JSON.stringify({ version: 1, muted: true, volume: 4 }),
    );

    expect(readPetVoicePreferences()).toEqual({ muted: true, volume: 1 });
  });

  it("ignores malformed and unknown-version data", () => {
    window.localStorage.setItem(PET_VOICE_STORAGE_KEY, "not-json");
    expect(readPetVoicePreferences()).toEqual({ muted: false, volume: 0.7 });

    window.localStorage.setItem(
      PET_VOICE_STORAGE_KEY,
      JSON.stringify({ version: 2, muted: true, volume: 0 }),
    );
    expect(readPetVoicePreferences()).toEqual({ muted: false, volume: 0.7 });
  });
});
