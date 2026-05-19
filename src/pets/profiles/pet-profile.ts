import type { SimulationComponent } from "@/core/components/simulation-components";

export type PetProfile = {
  id: string;
  petAssetId: string;
  components: SimulationComponent[];
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
