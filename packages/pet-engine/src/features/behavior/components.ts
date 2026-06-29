import type { PetEmoteKind, PetMood } from "@pets-driven/design-system";

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
  "user-interaction" | "agent-event" | "collision" | "autonomous";

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
  | "idle-stay"
  // Phase 3 — social reactions driven by Perception.nearbyPets
  | "approach-pet"
  | "flee-from-pet"
  // Phase 4 — personality-shaped collision responses (after deliberation latency)
  | "collision-flee"
  | "collision-engage"
  | "collision-avoid"
  | "collision-jump"
  | "collision-stay"
  | "collision-unfazed";

export type BehaviorDecisionTokenComponent = {
  type: "BehaviorDecisionToken";
  kind: BehaviorDecisionKind;
  decidedAt: number;
  consumed: boolean;
  selectionTrace?: BehaviorDecisionSelectionTrace;
  targetPosition?: { x: number; y: number };
  targetEntityId?: string;
  climbSurfaceId?: string;
  climbTargetY?: number;
};

export type BehaviorDecisionSelectionCandidate = {
  kind: BehaviorDecisionKind;
  score: number;
  weight: number;
  probability: number;
  cumulativeProbability: number;
  selected: boolean;
};

export type BehaviorDecisionSelectionTrace = {
  temperature: number;
  randomRoll: number;
  totalWeight: number;
  selectedKind: BehaviorDecisionKind;
  candidates: BehaviorDecisionSelectionCandidate[];
};

/** Numeric priority — lower value wins. */
export const BEHAVIOR_PRIORITY: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 1,
  "agent-event": 2,
  collision: 3,
  autonomous: 4,
};

// ── Phase 4: Pending Reaction ──────────────────────────────────────────────

/**
 * Written by CollisionBehaviorSystem when an overlap is detected.
 * The pet "freezes" until `now >= reactsAt`, at which point
 * BehaviorDecisionSystem reads this component and routes the pet
 * into the reactive candidate pool (collision-flee / engage / avoid / stay / unfazed).
 * Removed immediately after the reaction token is emitted.
 */
export type ReactionSource = "collision" | "agent-event" | "arrival";

export type PendingReactionComponent = {
  type: "PendingReaction";
  source: ReactionSource;
  triggeredAt: number;
  reactsAt: number;
  context: {
    otherEntityId?: string;
    otherPosition?: { x: number; y: number };
    eventType?: string;
  };
};

export type PetExpressionSource = "collision";

export type PetExpressionStateComponent = {
  type: "PetExpressionState";
  source: PetExpressionSource;
  mood: PetMood;
  emote: PetEmoteKind;
  label: string | null;
  startedAt: number;
  expiresAt: number;
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
