import type { Vector } from "@/features/physics/components";

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

/** Stores the entity or world position the pet is currently trying to reach. */
export type MotionTargetComponent = {
  type: "MotionTarget";
  targetEntityId: string | null;
  targetPosition: Vector | null;
};

// ── Capability components ──────────────────────────────────────────────────

/** Walk movement capability and force tuning. */
export type CanWalkComponent = {
  type: "CanWalk";
  force: number;
};

/** Force magnitudes used by steering-based movement for each intent. */
export type MovementProfileComponent = {
  type: "MovementProfile";
  idleForce: number;
  activeForce: number;
  seekForce: number;
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

export type JumpActionPhase =
  | "ready"
  | "requested"
  | "rising"
  | "falling"
  | "landingCooldown";

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
};

export type ClimbDismountPhase = "ready" | "airborne" | "coolingDown";

export type ClimbDismountStateComponent = {
  type: "ClimbDismountState";
  phase: ClimbDismountPhase;
  cooldownMs: number;
};
