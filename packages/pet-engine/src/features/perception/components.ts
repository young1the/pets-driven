import type { SteeringMode } from "@pets-driven/pet-engine/features/behavior/components";

export type PerceivedEntity = {
  id: string;
  position: { x: number; y: number };
  distance: number;
};

/**
 * Per-pet view of the live cursor, derived from the "user-anchor" entity's
 * CursorState each tick. `speed` is px/s over a short smoothing window;
 * `isPlayful` flags fast/darting motion near this pet (laser-pointer chase
 * trigger). Optional (not `| undefined` required) so existing fixtures/tests
 * that construct a Perception literal without this field keep type-checking —
 * PerceptionSystem always assigns it (to a value or null) once it runs.
 */
export type CursorPerception = {
  position: { x: number; y: number };
  distance: number;
  speed: number;
  isPlayful: boolean;
};

export type PerceptionComponent = {
  type: "Perception";
  userAnchor: PerceivedEntity | null;
  nearbyPets: PerceivedEntity[];
  nearbyClimbables: PerceivedEntity[];
  /**
   * Trinkets lying on the desktop, nearest first. Optional for the same reason
   * `cursor` is: existing fixtures and tests build Perception literals without
   * it, and PerceptionSystem always assigns it once it runs.
   */
  nearbyItems?: PerceivedEntity[];
  cursor?: CursorPerception | null;
  self: {
    grounded: boolean;
    climbing: boolean;
    mode: SteeringMode;
  };
};
