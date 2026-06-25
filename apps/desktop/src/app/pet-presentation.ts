import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

/** Human-readable role label for a pet, derived from its personality preset. */
export function personalityRoleLabel(
  personalityId: PetPersonalityId | undefined,
): string {
  const option = PERSONALITY_OPTIONS.find(
    (candidate) => candidate.id === personalityId,
  );

  return option ? option.title : "Pet";
}
