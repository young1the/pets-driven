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
};

/** Numeric priority — lower value wins. */
export const BEHAVIOR_PRIORITY: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 1,
  "agent-event": 2,
  "collision": 3,
  "autonomous": 4,
};

/**
 * Personality weights consumed by BehaviorSelectionSystem.
 * Each axis is 0..1; values are tendencies, not absolutes.
 */
export type BehaviorPreferenceComponent = {
  type: "BehaviorPreference";
  /** Tendency for exploration — boosts wander-far. */
  curiosity: number;
  /** Tendency to seek the user anchor. */
  sociability: number;
  /** Tendency for action behaviors (jump, climb). */
  playfulness: number;
  /** Tendency to stay near or retreat. */
  shyness: number;
};
