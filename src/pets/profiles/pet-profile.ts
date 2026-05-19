import type { AvoidsCrowds } from "@/pets/personalities/components/avoids-crowds";
import type { Curious } from "@/pets/personalities/components/curious";
import type { SeeksUser } from "@/pets/personalities/components/seeks-user";
import type { Talkative } from "@/pets/personalities/components/talkative";

export type PersonalityComponent = AvoidsCrowds | Curious | SeeksUser | Talkative;

export type PetProfile = {
  id: string;
  petAssetId: string;
  components: PersonalityComponent[];
};

export function isPetProfile(value: unknown): value is PetProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as PetProfile;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.petAssetId === "string" &&
    Array.isArray(candidate.components)
  );
}
