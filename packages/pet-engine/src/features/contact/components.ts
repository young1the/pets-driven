import type { Vector } from "@pets-driven/pet-engine/features/physics/components";

/** Runtime environmental contact sensed for an entity. */
export type ContactStateComponent = {
  type: "ContactState";
  grounded: boolean;
  climbableSurfaceId: string | null;
  climbableSurfacePosition: Vector | null;
};
