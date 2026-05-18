export type PetAsset = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

export function isPetAsset(value: unknown): value is PetAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as PetAsset;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.spritesheetPath === "string"
  );
}
