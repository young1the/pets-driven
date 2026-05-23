/**
 * Wall-climb movement capability and tuning. ClimbingState decides whether
 * this capability is currently active.
 */
export type CanWallClimbComponent = {
  type: "CanWallClimb";
  speed: number;
};

/**
 * Marker for environmental entities that a climbing-capable pet can attach to.
 * Position belongs to Transform; this component only identifies the surface.
 */
export type ClimbableSurfaceComponent = {
  type: "ClimbableSurface";
};

/**
 * Runtime request to climb a specific surface. Approach systems use the
 * surface id for walking attachment, then attachment turns targetY into the
 * actual climb MotionTarget after contact is established.
 */
export type ClimbIntentStateComponent = {
  type: "ClimbIntentState";
  phase: "approaching" | "attached";
  surfaceEntityId: string;
  targetY: number;
};

/**
 * Temporary state after a pet leaves a climbable surface. Airborne dismounts
 * block reattachment until the pet lands, then run a short grounded cooldown.
 */
export type ClimbDismountPhase = "ready" | "airborne" | "coolingDown";

export type ClimbDismountStateComponent = {
  type: "ClimbDismountState";
  phase: ClimbDismountPhase;
  cooldownMs: number;
};
