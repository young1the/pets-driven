import type { Vector } from "@/features/physics/components";

// ── Locomotion mode tags ───────────────────────────────────────────────────

/** Active locomotion tag for entities currently controlled by walking systems. */
export type WalkingStateComponent = {
  type: "WalkingState";
};

/** Active locomotion tag for entities currently attached to a climbable surface. */
export type ClimbingStateComponent = {
  type: "ClimbingState";
};

/** Active locomotion tag for entities currently controlled by flight systems. */
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

// ── Capability components ──────────────────────────────────────────────────

/** Walk movement capability and tuning. */
export type CanWalkComponent = {
  type: "CanWalk";
  speed: number;
};

/** Defines how quickly the entity moves for each intent. */
export type MovementProfileComponent = {
  type: "MovementProfile";
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
};

/** Stores temporary pathing decisions, such as predictive avoidance waypoints. */
export type NavigationStateComponent = {
  type: "NavigationState";
  avoidanceWaypoint: Vector | null;
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

/** Wall-climb movement capability and tuning. */
export type CanWallClimbComponent = {
  type: "CanWallClimb";
  speed: number;
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
