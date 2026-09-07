import type { PetPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";
import {
  PET_VOICE_PITCH_MAX,
  PET_VOICE_PITCH_MIN,
} from "@pets-driven/pet-engine/pets/profiles/pet-voice";

export {
  defaultPitchForPet,
  PET_VOICE_PITCH_MAX,
  PET_VOICE_PITCH_MIN,
  sanitizePetVoiceSettings,
} from "@pets-driven/pet-engine/pets/profiles/pet-voice";

export type PetVoiceSynthesisProfile = {
  pitch: number;
  speed: number;
  randomness: number;
  melodyRate: number;
  melodyAmplitude: number;
  spaceDelay: number;
  punctuationDelay: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(min: number, max: number, amount: number): number {
  return min + (max - min) * clamp(amount, 0, 1);
}

/**
 * Convert the existing OCEAN personality into audible delivery. Base pitch is
 * deliberately absent: pitch is a pet identity, while these values describe
 * how that pet delivers every line.
 */
export function voiceProfileForPersonality(
  personality: PetPersonality,
  pitch: number,
): PetVoiceSynthesisProfile {
  const confidence = (personality.conscientiousness + (1 - personality.neuroticism)) / 2;
  const energy = personality.extraversion;
  const impulsiveness = (personality.neuroticism + (1 - personality.conscientiousness)) / 2;
  const playfulness =
    (personality.openness + personality.extraversion + (1 - personality.conscientiousness)) / 3;

  return {
    pitch: clamp(pitch, PET_VOICE_PITCH_MIN, PET_VOICE_PITCH_MAX),
    // animalese-tts uses a higher multiplier for faster speech. Calm, inward
    // pets therefore stay near the low end rather than receiving a high value.
    speed: lerp(2.6, 3.7, energy),
    randomness: lerp(0.06, 0.015, confidence) * lerp(0.9, 1.1, impulsiveness),
    melodyRate: lerp(0.03, 0.08, energy),
    melodyAmplitude: lerp(0.025, 0.075, playfulness),
    spaceDelay: lerp(0.08, 0.02, energy),
    punctuationDelay: lerp(0.42, 0.18, energy),
  };
}
