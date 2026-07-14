import type { Vector } from "@pets-driven/pet-engine/features/physics/components";

// ── Locomotion mode tags ───────────────────────────────────────────────────

/** Active locomotion tag for entities currently controlled by walking systems. */
export type WalkingTagComponent = {
  type: "WalkingTag";
};

/** Active locomotion tag for entities currently attached to a climbable surface. */
export type ClimbingTagComponent = {
  type: "ClimbingTag";
};

/** Active locomotion tag for entities currently controlled by flight systems. */
export type FlyingTagComponent = {
  type: "FlyingTag";
};

/** Active contact-derived tag for non-flying, non-climbing entities in the air. */
export type AirborneTagComponent = {
  type: "AirborneTag";
};

/**
 * Per-tick screen displacement, derived from the pet's own Transform rather
 * than the matter.js body velocity. TravelTrackingSystem writes this at the
 * end of each simulation tick by differencing the current Transform position
 * against the previous tick's. The animation layer reads dx/dy to choose a
 * directional running row, so "which way is the pet visibly moving" stays a
 * function of engine position state and never reaches into the physics library.
 */
export type TravelStateComponent = {
  type: "TravelState";
  previousPosition: Vector;
  dx: number;
  dy: number;
};

/** Stores the entity or world position the pet is currently trying to reach. */
export type MotionTargetComponent = {
  type: "MotionTarget";
  targetEntityId: string | null;
  targetPosition: Vector | null;
  /**
   * Gait: multiplies the locomotion force while pursuing this target, so the
   * *intent* behind a movement shows in its speed — sauntering up to a friend
   * to say hi (< 1) reads differently from dashing in a chase (> 1). Absent
   * means the pet's normal pace. Writers that replace the whole component
   * reset the gait, which is the desired default.
   */
  speedFactor?: number;
  /**
   * No-progress watchdog for positional targets, maintained by the arrival
   * system: the closest the pet has come to the target and when. A walker that
   * jams against a side wall or an interior monitor step (an L-shaped dual-
   * monitor layout has a hidden wall at the height step) can never shrink its
   * horizontal distance, so it would hold this target forever, never return to
   * idle, and never re-decide. When no progress is made for the stuck timeout
   * the target is abandoned. Undefined on a fresh target — writers replace the
   * whole component, which restarts the watchdog.
   */
  progressBest?: number;
  progressAt?: number;
};

// ── Capability components ──────────────────────────────────────────────────

/** Walk movement capability and force tuning. */
export type CanWalkComponent = {
  type: "CanWalk";
  force: number;
};

/** Force magnitudes used by steering-based movement, one per Steering mode. */
export type MovementProfileComponent = {
  type: "MovementProfile";
  standForce: number;
  pursueForce: number;
  arriveForce: number;
};

/** Personality component for pets that keep wandering after reaching a target. */
export type WandersOnArrivalComponent = {
  type: "WandersOnArrival";
  arrivalRadius: number;
};

/** Jump movement capability and tuning. */
export type CanJumpComponent = {
  type: "CanJump";
  impulse: number;
  forwardImpulse?: {
    min: number;
    max: number;
  };
};

export type JumpActionPhase = "ready" | "requested" | "rising" | "falling" | "landingCooldown";

export type JumpActionStateComponent = {
  type: "JumpActionState";
  phase: JumpActionPhase;
  cooldownMs: number;
};

/** Flight movement tuning. */
export type CanFlyComponent = {
  type: "CanFly";
  gravityScale: number;
  hoverStrength: number;
};

/** Wall-climb movement capability and constant velocity tuning. */
export type CanWallClimbComponent = {
  type: "CanWallClimb";
  velocity: number;
  dismountImpulse?: {
    min: number;
    max: number;
  };
};

/** Marker for environmental entities that a climbing-capable pet can attach to. */
export type ClimbableSurfaceComponent = {
  type: "ClimbableSurface";
};

/** Runtime request to climb a specific surface. */
export type ClimbIntentStateComponent = {
  type: "ClimbIntentState";
  phase: "approaching" | "attached";
  surfaceEntityId: string;
  targetY: number;
  /**
   * When the approach began. An approach that cannot complete (the pet
   * reaches the surface x but contact/attachment never fires) would
   * otherwise oscillate at the wall forever; ClimbApproachSystem cancels it
   * after a timeout. Optional for pre-existing states scripted directly into
   * the attached phase.
   */
  startedAt?: number;
};

export type ClimbDismountPhase = "ready" | "airborne" | "coolingDown";

export type ClimbDismountStateComponent = {
  type: "ClimbDismountState";
  phase: ClimbDismountPhase;
  cooldownMs: number;
};
