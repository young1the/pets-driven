import type { PetPersonality } from "@/pets/personalities/factories";

export type PetProfile = {
  id: string;
  petAssetId: string;
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
