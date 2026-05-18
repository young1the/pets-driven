export type PersonalityComponent =
  | { type: "Curious"; weight: number }
  | { type: "Talkative"; idleAfterMs: number }
  | { type: "AvoidsCrowds"; radius: number }
  | { type: "SeeksUser"; distance: number };

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
