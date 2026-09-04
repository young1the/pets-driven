import {
  defaultPitchForPet,
  PET_VOICE_PITCH_MAX,
  PET_VOICE_PITCH_MIN,
  sanitizePetVoiceSettings,
} from "@pets-driven/pet-engine/pets/profiles/pet-voice";
import { describe, expect, it } from "vitest";

describe("pet voice settings", () => {
  it("derives a stable, identity-specific default pitch", () => {
    const first = defaultPitchForPet("pet-uuid-1");

    expect(defaultPitchForPet("pet-uuid-1")).toBe(first);
    expect(defaultPitchForPet("pet-uuid-2")).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(1.1);
    expect(first).toBeLessThanOrEqual(1.7);
  });

  it("sanitizes persisted values and restores missing defaults", () => {
    expect(sanitizePetVoiceSettings("pet-a", { pitch: 10, muted: true })).toEqual({
      pitch: PET_VOICE_PITCH_MAX,
      muted: true,
    });
    expect(sanitizePetVoiceSettings("pet-a", { pitch: -10, muted: false })).toEqual({
      pitch: PET_VOICE_PITCH_MIN,
      muted: false,
    });
    expect(sanitizePetVoiceSettings("pet-a", undefined)).toEqual({
      pitch: defaultPitchForPet("pet-a"),
      muted: false,
    });
  });
});
