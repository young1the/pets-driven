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

/** Claim reason for the ambient idle-companion speech line. */
export const IDLE_CONVERSATION_REASON = "idle conversation";

/**
 * Autonomous claim reasons that are bookkeeping, not movement decisions.
 * Idle-companion speech re-claims every time its bubble expires (~1.5s), so
 * letting it record history or gate the arrival dwell would clobber every
 * repeat-cooldown mid-activity and randomly skip rest beats.
 */
export const BOOKKEEPING_AUTONOMOUS_REASONS: ReadonlySet<string> = new Set([
  ARRIVAL_DWELL_REASON,
  IDLE_CONVERSATION_REASON,
]);

/** Numeric priority — lower value wins. */
export const BEHAVIOR_PRIORITY: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 1,
  "agent-event": 2,
  // A committed pet-to-pet session outranks collision reactions: sessions
  // produce contact by design (greet gaps close in, chases catch), so the
  // contact they cause must not tear them down — this reverses the original
  // ordering where any overlap killed a running session. While a social
  // claim is live the collision guards also skip the pet entirely, so
  // session members shrug off bumps; physical separation stays with the
  // claim-independent CollisionEscapeSystem. User touches and agent events
  // still interrupt sessions.
  social: 3,
  collision: 4,
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

/**
 * Blocked-walk tracking for CollisionYieldSystem: a walker pressing against
 * another pet that sits between it and its target is grinding (or slowly
 * bulldozing the neighbor), not walking. Neither PetCollision age (pressing
 * bodies separate and retouch every few frames) nor distance progress (a
 * bulldozed neighbor still yields slow "progress") detects this reliably, so
 * the system measures the geometric fact directly — body-to-body gap in the
 * walk direction — and accumulates how long it has persisted.
 */
export type BlockedPathStateComponent = {
  type: "BlockedPathState";
  /** Target x this state was measured against; a new target resets tracking. */
  targetX: number;
  /** Accumulated milliseconds spent pressing against an in-the-way pet. */
  blockedMs: number;
};

/**
 * Per-pair collision reaction memory: after reacting to a specific neighbor,
 * the pet ignores further collisions with that same neighbor for a cooldown
 * window. Without this, clustered pets re-startle on every overlap (the
 * collision claim only lasts ~1s) and their behavior never settles — the
 * "rapid behavior flip-flop" symptom. Bounded list, lazily pruned on write.
 */
export type CollisionMemoryComponent = {
  type: "CollisionMemory";
  entries: Array<{ otherId: string; lastReactedAt: number }>;
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
