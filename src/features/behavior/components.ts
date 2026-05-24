/** Drives AutonomousBehaviorSystem and MotionTargetSystem target selection. */
export type PetIntent = "idle" | "active" | "seek";

/** Stores the current high-level behavior intent selected for the entity. */
export type IntentStateComponent = {
  type: "IntentState";
  intent: PetIntent;
};

/** Human-facing identity for rendering and status panels. */
export type PetIdentityComponent = {
  type: "PetIdentity";
  name: string;
};

/** Marker for the entity that represents the user as a seekable target. */
export type UserAnchorComponent = {
  type: "UserAnchor";
};

/**
 * Claim token written by whichever behavior system wins priority this frame.
 * Lower-priority systems skip an entity when this component is present with a
 * higher-ranked source. Expires at expiresAt (clock.now() time).
 */
export type BehaviorDecisionSource =
  | "user-interaction"
  | "agent-event"
  | "collision"
  | "autonomous";

export type BehaviorDecisionStateComponent = {
  type: "BehaviorDecisionState";
  source: BehaviorDecisionSource;
  decidedAt: number;
  expiresAt: number;
  reason: string;
  /**
   * Carried forward from the previous autonomous decision when a
   * higher-priority claim (collision, agent-event) overwrites this component.
   * Used by isAutonomousRepeatCoolingDown so that repeat-cooldowns survive
   * collision and agent-event claims.
   */
  lastAutonomousReason: string | null;
  lastAutonomousAt: number | null;
};

export type BehaviorDecisionKind =
  | "wander-near"
  | "wander-far"
  | "seek-user"
  | "request-jump"
  | "request-climb"
  | "idle-stay";

export type BehaviorDecisionTokenComponent = {
  type: "BehaviorDecisionToken";
  kind: BehaviorDecisionKind;
  decidedAt: number;
  consumed: boolean;
  targetPosition?: { x: number; y: number };
  targetEntityId?: string;
  climbSurfaceId?: string;
  climbTargetY?: number;
};

/** Numeric priority — lower value wins. */
export const BEHAVIOR_PRIORITY: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 1,
  "agent-event": 2,
  "collision": 3,
  "autonomous": 4,
};

/**
 * Big-Five (OCEAN) personality traits driving behavior selection.
 * Each axis is 0..1; values are tendencies, not absolutes.
 *
 * O (openness)          — exploration; boosts wander-far and request-climb
 * C (conscientiousness) — follow-through; lowers softmax temperature (Phase 2)
 * E (extraversion)      — social energy; boosts seek-user, speech freq, move speed
 * A (agreeableness)     — engagement; boosts collision-engage, approach-pet (Phase 3+)
 * N (neuroticism)       — anxiety; boosts wander-near/flee, raises softmax temperature
 *
 * Replaces the former 4-axis BehaviorPreferenceComponent (deleted in Phase 1).
 */
export type PersonalityComponent = {
  type: "Personality";
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};
