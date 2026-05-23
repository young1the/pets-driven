/**
 * Jump movement capability and tuning. Component presence means the entity can
 * jump; jumping runs when JumpActionState requests a one-shot jump action.
 */
export type CanJumpComponent = {
  type: "CanJump";
  impulse: number;
};

/**
 * Runtime phase for the jump action. Jump is modeled as an action rather than
 * a locomotion mode so it can combine with walking and airborne contact.
 */
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
