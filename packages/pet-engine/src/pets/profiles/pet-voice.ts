export type PetVoiceSettings = {
  pitch: number;
  muted: boolean;
};

export const PET_VOICE_PITCH_MIN = 0.9;
export const PET_VOICE_PITCH_MAX = 1.9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Stable FNV-1a hash. Pet ids are random, so their mapped pitch is random-looking but durable. */
function hashPetId(petId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < petId.length; index += 1) {
    hash ^= petId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function defaultPitchForPet(petId: string): number {
  const unit = hashPetId(petId) / 0xffffffff;
  return Number((1.1 + 0.6 * unit).toFixed(2));
}

export function sanitizePetVoiceSettings(
  petId: string,
  value: Partial<PetVoiceSettings> | null | undefined,
): PetVoiceSettings {
  return {
    pitch:
      typeof value?.pitch === "number" && Number.isFinite(value.pitch)
        ? clamp(value.pitch, PET_VOICE_PITCH_MIN, PET_VOICE_PITCH_MAX)
        : defaultPitchForPet(petId),
    muted: value?.muted === true,
  };
}
