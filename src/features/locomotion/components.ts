import type { Vector } from "@/features/physics/components";

/**
 * Active locomotion tag for entities currently controlled by walking systems.
 * Capability remains separate in CanWalk.
 */
export type WalkingStateComponent = {
  type: "WalkingState";
};

/**
 * Active locomotion tag for entities currently attached to a climbable surface.
 * Capability remains separate in CanWallClimb.
 */
export type ClimbingStateComponent = {
  type: "ClimbingState";
};

/**
 * Active locomotion tag for entities currently controlled by flight systems.
 * Capability remains separate in CanFly.
 */
export type FlyingStateComponent = {
  type: "FlyingState";
};

/** Active contact-derived tag for non-flying, non-climbing entities in the air. */
export type AirborneStateComponent = {
  type: "AirborneState";
};

/** Stores the entity or world position the pet is currently trying to reach. */
export type MotionTargetComponent = {
  type: "MotionTarget";
  targetEntityId: string | null;
  targetPosition: Vector | null;
};
