import type { PetEmoteKind, PetMood } from "@pets-driven/pet-engine/pets/status/pet-mood";

/**
 * The pet's high-level steering mode, driving AutonomousBehaviorSystem and
 * MotionTargetSystem target selection: `stand` = hold position, `pursue` = move
 * toward a chosen target, `arrive` = ease up to the user anchor.
 */
export type SteeringMode = "stand" | "pursue" | "arrive";

/** Stores the current steering mode selected for the entity. */
export type SteeringComponent = {
  type: "Steering";
  mode: SteeringMode;
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
// Listed in priority order (highest first); the numeric ranking lives in
// BEHAVIOR_PRIORITY below and is the source of truth.
export type BehaviorDecisionSource =
  | "user-interaction"
  | "agent-event"
  | "social"
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
  | "play-romp"
  // Personality signature activities with sustained, readable choreography.
  | "nap"
  | "meditate"
  | "play-feint"
  | "keep-watch"
  | "peek"
  | "withdraw"
  | "inspect"
  | "follow-routine"
  | "strut"
  | "offer-comfort"
  | "stand-lookout"
  // Second signature beat per personality — an additional catalog-exclusive
  // pose so every preset is known for two readable silhouettes, not one.
  | "caper" // playful — a giddy dance-about
  | "check-in" // attentive — trots close and looks you over
  | "hide-away" // reserved — tucks quietly out of view
  | "explore-nook" // curious — pokes into a corner
  | "tidy-up" // steady — a brisk, orderly straighten
  | "posture" // feisty — puffs up and shows off
  | "nurture" // gentle — a doting little fuss
  | "scheme" // mischievous — plotting the next prank
  | "lounge" // lazy — sprawls out and loafs
  | "center" // zen — settles into a poised stillness
  | "preen" // aloof — cool, unhurried self-grooming
  | "startle-scan" // skittish — a jumpy sweep of the room
  | "appraise" // shrewd — a calculating, sizing-up study
  // Expressive idle poses — sustained, stationary gestures that exercise the
  // otherwise agent-only sprite rows (waving / focus / review / waiting /
  // failed) during ordinary autonomous life. Each is personality-shaped.
  | "greet" // waving row — a friendly hello (high E/A)
  | "groom" // focus/"running" row — absorbed self-tidying (high C)
  | "observe" // review row — curious examination (high O)
  | "beckon" // waiting row — an expectant "come here" (lonely, agreeable)
  | "fret"; // failed row — an anxious sulk (high N)

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

/** Two-beat mischievous activity: approach a target, then dash away. */
export type FeintStateComponent = {
  type: "FeintState";
  phase: "approach" | "retreat";
  targetEntityId: string;
  startedAt: number;
  turnsAt: number;
  endsAt: number;
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
  | "hover"
  | "social"
  | "romp"
  | "acknowledge"
  | "signature"
  // Expressive idle poses and catalog-exclusive signature activities.
  | "expressive";

// The mood/emote vocabulary is defined once in the pet-status rendering module
// (the SSOT) and aliased here so the simulation-side expression state and the
// presentation layer can never drift apart.
export type PetExpressionMood = PetMood;

export type PetExpressionEmote = PetEmoteKind;

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
  /** Catalog identity that supplies categorical behavior signatures. */
  catalogId?: import("@pets-driven/pet-engine/pets/personalities/registry").PetPersonalityId;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};
