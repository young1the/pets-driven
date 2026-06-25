import type { PetPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";

export type { PetPersonalityId };

export type PetProfile = {
  id: string;
  petAssetId: string;
  /** Which preset the personality came from; lets management re-pick later. */
  personalityId?: PetPersonalityId;
  personality: PetPersonality;
};

export function isPetProfile(value: unknown): value is PetProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as PetProfile;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.petAssetId === "string" &&
    typeof candidate.personality === "object" &&
    candidate.personality !== null
  );
}
