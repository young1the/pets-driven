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
  | "social"
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
  | "collision-unfazed"
  // Cursor play — laser-pointer-style chase triggered by Perception.cursor
  | "chase-cursor"
  // Solo play — a sustained hop-and-dash activity for playful (high-E/O) pets.
  | "play-romp";

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
  /**
   * For sustained activities (play-romp): how long the activity — and its
   * autonomous claim — should live. Sub-second claims are what made pets feel
   * twitchy; activities hold their claim for their whole duration instead.
   */
  activityDurationMs?: number;
};

/**
 * Live state of a play-romp activity: the pet strings together short dashes
 * and hops until endsAt. Written by BehaviorPlanningSystem, advanced by
 * RompProgressSystem, removed on natural end or when a higher-priority claim
 * takes the pet over.
 */
export type RompStateComponent = {
  type: "RompState";
  startedAt: number;
  endsAt: number;
  nextHopAt: number;
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

/**
 * Claim reason for the post-arrival rest beat. It is bookkeeping, not a real
 * autonomous decision: claim carry-forward and repeat-cooldown checks must
 * look *through* it at the last genuine decision (wander-near, play-romp, …)
 * or every cooldown would reset each time a pet pauses after a walk.
 */
export const ARRIVAL_DWELL_REASON = "arrival-dwell";

/** Numeric priority — lower value wins. */
export const BEHAVIOR_PRIORITY: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 1,
  "agent-event": 2,
  collision: 3,
  // A committed pet-to-pet session outranks solo autonomous wandering, but a
  // collision, an agent event, or a user touch still interrupts it.
  social: 4,
  autonomous: 5,
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

export type PetExpressionSource =
  | "collision"
  | "chase-cursor"
  | "petting"
  | "social"
  | "romp";

export type PetExpressionMood =
  "working" | "happy" | "love" | "excited" | "thinking" | "sleepy" | "confused";

export type PetExpressionEmote =
  "none" | "heart" | "zzz" | "sparkle" | "question" | "exclaim";

export type PetExpressionStateComponent = {
  type: "PetExpressionState";
  source: PetExpressionSource;
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
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
