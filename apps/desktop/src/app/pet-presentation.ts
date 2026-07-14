import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

/**
 * Translation key for a pet's role label, derived from its personality preset.
 * Returns a `personality.*` key in the desktop bundle; callers pass it through
 * `t()`. Unknown or missing personalities fall back to the generic role key.
 */
export function personalityRoleLabelKey(personalityId: PetPersonalityId | undefined): string {
  const option = PERSONALITY_OPTIONS.find((candidate) => candidate.id === personalityId);

  return option ? `personality.${option.id}.title` : "personality.role";
}
