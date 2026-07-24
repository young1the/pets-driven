import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  type AgentTaskStatus,
  statusFreezesMovement,
} from "@pets-driven/pet-engine/features/agent/agent-task-state";
import { utteranceChannel } from "@pets-driven/pet-engine/features/agent/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import { clampDrive, driveResponseCurve } from "@pets-driven/pet-engine/features/drives/systems";
import type {
  AgentWorldEvent,
  WorldEvent,
} from "@pets-driven/pet-engine/features/events/world-event";
import {
  moodAdjustedDecisionScore,
  recordPetExperience,
} from "@pets-driven/pet-engine/features/mood/systems";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
import { isBumpSocialEligible } from "@pets-driven/pet-engine/features/social/systems";
import {
  personalityArrivalDwellScale,
  personalityIdleDurationScale,
  signedDecisionScore,
} from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import {
  personalityAcknowledgeFeedback,
  resolveSpeechVariant,
} from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import {
  ARRIVAL_DWELL_REASON,
  BEHAVIOR_PRIORITY,
  type BehaviorDecisionKind,
  type BehaviorDecisionSelectionTrace,
  type BehaviorDecisionSource,
  type BehaviorDecisionTokenComponent,
  BOOKKEEPING_AUTONOMOUS_REASONS,
  IDLE_CONVERSATION_REASON,
  type PendingReactionComponent,
  type PersonalityComponent,
  type PetExpressionEmote,
  type PetExpressionMood,
  type ReactionSource,
  type SteeringMode,
} from "./components";

const DEFAULT_BEHAVIOR_BODY_WIDTH = 32;
const COLLISION_REACTION_WIDTH_MULTIPLIER = 6;
const COLLISION_TARGET_MARGIN = 48;
const USER_PROXIMITY_RADIUS = 96;
const APPROACH_PET_SUCCESS_RADIUS = 64;
const APPROACH_PET_TIMEOUT_MS = 4_000;
const APPROACH_PET_SUCCESS_CUE_MS = 1_000;
const SPEECH_BUBBLE_DURATION_MS = 3_000;

// Cursor play — laser-pointer-style chase.
const CHASE_CURSOR_SUCCESS_RADIUS = 48;
const CHASE_CURSOR_TIMEOUT_MS = 4_000;
const CHASE_CURSOR_SUCCESS_CUE_MS = 1_000;

// Cursor play — petting (cursor lingers over the pet's body and oscillates).
const PETTING_OSCILLATION_WINDOW_MS = 1_500;
const PETTING_MIN_REVERSALS = 3;
const PETTING_MAX_DISPLACEMENT_PX = 60;
const PETTING_DURATION_MS = 900;
const PETTING_BODY_PADDING = 8;

// Cursor play — hover (cursor rests over a moving pet: stop + react once).
const HOVER_BODY_PADDING = 8;
const HOVER_REACTION_DURATION_MS = 1_200;

const AUTONOMOUS_REPEAT_COOLDOWN_MS: Record<string, number> = {
  "wander-near": 750,
  "wander-far": 750,
  "seek-user": 4_000,
  "request-jump": 2_500,
  "request-climb": 6_000,
  "idle-stay": 1_500,
  // Phase 3
  "approach-pet": 1_500,
  "flee-from-pet": 2_000,
  // Phase 4 — collision reactions share the collision claim window
  "collision-flee": 750,
  "collision-engage": 1_500,
  "collision-avoid": 750,
  "collision-stay": 1_500,
  "collision-unfazed": 500,
  // Cursor play
  "chase-cursor": 2_000,
  // Sustained solo play — long cooldown so romps stay an occasional treat.
  "play-romp": 8_000,
  // Personal-space shuffle — after stepping aside, wait a while before again.
  "make-room": 4_000,
  // Expressive idle poses — occasional treats, same tier as play-romp so they
  // punctuate ordinary life without spamming.
  greet: 6_000,
  groom: 8_000,
  observe: 8_000,
  beckon: 6_000,
  fret: 8_000,
  nap: 15_000,
  meditate: 12_000,
  "play-feint": 10_000,
  "keep-watch": 10_000,
  peek: 10_000,
  withdraw: 8_000,
  inspect: 10_000,
  "follow-routine": 12_000,
  strut: 10_000,
  "offer-comfort": 10_000,
  "stand-lookout": 8_000,
  // Second signature poses — occasional treats like the first tier.
  caper: 10_000,
  "check-in": 10_000,
  "hide-away": 10_000,
  "explore-nook": 10_000,
  "tidy-up": 10_000,
  posture: 10_000,
  nurture: 10_000,
  scheme: 10_000,
  lounge: 14_000,
  center: 12_000,
  preen: 10_000,
  "startle-scan": 8_000,
  appraise: 10_000,
};

const WORKING_COLLISION_EXPIRABLE_AUTONOMOUS_REASONS = new Set<string>([
  "working-focus",
  "working-wander",
  "collision-flee",
  "collision-engage",
  "collision-avoid",
  "collision-stay",
  "collision-jump",
  "collision-unfazed",
]);

// Phase 3: social interaction distances
const PET_FLEE_WIDTH_MULTIPLIER = 6;
const DEFAULT_WANDER_BODY_WIDTH = DEFAULT_BEHAVIOR_BODY_WIDTH;
const WANDER_BASE_BODY_MULTIPLIER = 3;

// Phase 4: collision reaction constants
const PET_ENGAGE_STOP_WIDTH_MULTIPLIER = 2.5;

// B3: after reacting to a specific neighbor, ignore further collisions with
// that same neighbor for this long. Physical separation (CollisionEscape) is
// not gated — only the behavioral re-reaction is suppressed.
const PAIR_COLLISION_COOLDOWN_MS = 6_000;
const COLLISION_MEMORY_MAX_ENTRIES = 8;

function isPairCoolingDown(
  components: ComponentStore,
  id: string,
  otherId: string,
  now: number,
): boolean {
  const memory = components.getComponent(id, "CollisionMemory");
  const entry = memory?.entries.find((e) => e.otherId === otherId);
  return !!entry && now - entry.lastReactedAt < PAIR_COLLISION_COOLDOWN_MS;
}

function recordPairReaction(
  components: ComponentStore,
  id: string,
  otherId: string,
  now: number,
): void {
  const memory = components.getComponent(id, "CollisionMemory");
  // Lazy pruning: drop the entry being refreshed and anything already lapsed.
  const entries = (memory?.entries ?? []).filter(
    (e) => e.otherId !== otherId && now - e.lastReactedAt < PAIR_COLLISION_COOLDOWN_MS,
  );
  entries.push({ otherId, lastReactedAt: now });
  while (entries.length > COLLISION_MEMORY_MAX_ENTRIES) entries.shift();
  components.setComponent(id, { type: "CollisionMemory", entries });
}

// ── Drives satisfaction hooks ────────────────────────────────────────────
// Magnitudes on the same 0..1 scale as DrivesComponent fields. "Substantial"
// refills (catching a pet) are larger than "partial" ones (a friendly
// collision reaction); costs are small enough that a pet needs several
// jumps/climbs before it visibly tires.
const APPROACH_PET_SUCCESS_SOCIAL_REFILL = 0.5;
const COLLISION_ENGAGE_SOCIAL_REFILL = 0.15;
const WANDER_FAR_CURIOSITY_RELIEF = 0.35;
const CLIMB_CURIOSITY_RELIEF = 0.3;
const JUMP_ENERGY_COST = 0.08;
const CLIMB_ENERGY_COST = 0.12;

// ── Sustained activities ─────────────────────────────────────────────────
// Lifelike behavior happens on the tens-of-seconds scale, not the sub-second
// claim scale. Resting and playing are *activities with a duration*: their
// autonomous claim lives for the whole activity, so the decision loop stops
// re-rolling (and visibly pacing) every 500 ms.

// idle-stay: a real rest. Introverts settle for much longer than extraverts.
const IDLE_STAY_BASE_MS = 3_000;
const IDLE_STAY_INTROVERSION_MS = 9_000;
const IDLE_STAY_JITTER_MS = 3_000;

// A positional wander target the pet cannot make progress toward — jammed
// against a side wall or an interior monitor step (the hidden wall an L-shaped
// dual-monitor layout leaves at its height step) — is abandoned after this
// long with no improvement, so the pet returns to idle and re-decides instead
// of pushing into the wall forever. A shrink smaller than the epsilon counts as
// no progress, so slow-but-real walking keeps refreshing the timer while pure
// jitter against a wall does not.
const WANDER_STUCK_TIMEOUT_MS = 2_500;
const WANDER_PROGRESS_EPSILON = 2;

// Arriving anywhere earns a beat of stillness before the next decision —
// a pet that walks somewhere and immediately walks elsewhere reads as
// aimless pacing. Extraverts dwell briefly; introverts linger.
const ARRIVAL_DWELL_BASE_MS = 700;
const ARRIVAL_DWELL_INTROVERSION_MS = 2_300;
const ARRIVAL_DWELL_JITTER_MS = 1_000;

// play-romp: playful pets string hops and dashes together for a while.
const ROMP_BASE_MS = 4_000;
const ROMP_EXTRA_MS = 4_000;
const ROMP_HOP_INTERVAL_BASE_MS = 550;
const ROMP_HOP_INTERVAL_JITTER_MS = 450;
const ROMP_HOP_RANGE_MIN_BODY_WIDTHS = 2;
const ROMP_HOP_RANGE_MAX_BODY_WIDTHS = 5;
const ROMP_SPEED_FACTOR = 1.15;
const ROMP_HOP_ENERGY_COST = JUMP_ENERGY_COST * 0.5;
const ROMP_END_CUE_MS = 800;

// play-feint: mischievous pets approach as if asking for attention, then turn
// on their heel and dash away. The turn is time-based so the beat completes
// even when the target moves or the pet cannot quite reach it.
const FEINT_BASE_MS = 3_200;
const FEINT_EXTRA_MS = 1_200;
const FEINT_APPROACH_MS = 1_200;
const FEINT_RETREAT_BODY_WIDTHS = 5;
const WITHDRAW_BODY_WIDTHS = 5;
const WITHDRAW_DURATION_MS = 3_500;
const STRUT_BODY_WIDTHS = 6;
const STRUT_DURATION_MS = 4_500;
const STRUT_SPEED_FACTOR = 0.75;

type ExpressivePoseKind =
  | "greet"
  | "groom"
  | "observe"
  | "beckon"
  | "fret"
  | "nap"
  | "meditate"
  | "keep-watch"
  | "peek"
  | "inspect"
  | "follow-routine"
  | "offer-comfort"
  | "stand-lookout"
  // Second signature pose per personality.
  | "caper"
  | "check-in"
  | "hide-away"
  | "explore-nook"
  | "tidy-up"
  | "posture"
  | "nurture"
  | "scheme"
  | "lounge"
  | "center"
  | "preen"
  | "startle-scan"
  | "appraise";

// ── Expressive idle poses ──────────────────────────────────────────────────
// Sustained, stationary gestures that exercise the otherwise agent-only sprite
// rows during ordinary autonomous life (see BehaviorDecisionKind). Like
// idle-stay and play-romp, each holds its autonomous claim for the whole pose
// so the pet reads as genuinely doing something rather than twitching. Base +
// jitter loosely track each row's sprite loop length so the animation completes
// a few cycles.
const EXPRESSIVE_POSE_DURATIONS: Record<ExpressivePoseKind, { base: number; jitter: number }> = {
  greet: { base: 1_400, jitter: 800 },
  groom: { base: 3_000, jitter: 1_500 },
  observe: { base: 2_200, jitter: 1_200 },
  beckon: { base: 1_800, jitter: 900 },
  fret: { base: 1_600, jitter: 900 },
  nap: { base: 7_000, jitter: 5_000 },
  meditate: { base: 5_000, jitter: 3_000 },
  "keep-watch": { base: 4_000, jitter: 2_000 },
  peek: { base: 3_500, jitter: 2_000 },
  inspect: { base: 3_000, jitter: 2_000 },
  "follow-routine": { base: 4_000, jitter: 2_000 },
  "offer-comfort": { base: 3_000, jitter: 1_500 },
  "stand-lookout": { base: 2_500, jitter: 1_500 },
  // Second signature poses — same tier as their sibling beats.
  caper: { base: 3_000, jitter: 2_000 },
  "check-in": { base: 3_000, jitter: 1_500 },
  "hide-away": { base: 4_000, jitter: 2_500 },
  "explore-nook": { base: 3_000, jitter: 2_000 },
  "tidy-up": { base: 3_500, jitter: 2_000 },
  posture: { base: 2_800, jitter: 1_500 },
  nurture: { base: 3_000, jitter: 1_500 },
  scheme: { base: 3_000, jitter: 2_000 },
  lounge: { base: 6_000, jitter: 4_000 },
  center: { base: 5_000, jitter: 3_000 },
  preen: { base: 3_500, jitter: 2_000 },
  "startle-scan": { base: 2_200, jitter: 1_500 },
  appraise: { base: 3_500, jitter: 2_000 },
};

/** Mood/emote cue attached to each expressive pose (a PetExpressionState). */
const EXPRESSIVE_POSE_CUES: Record<
  ExpressivePoseKind,
  { mood: PetExpressionMood; emote: PetExpressionEmote }
> = {
  greet: { mood: "happy", emote: "sparkle" },
  // Humming while tidying — "none" left the most conscientious pose entirely
  // unreadable next to a plain idle.
  groom: { mood: "working", emote: "note" },
  observe: { mood: "thinking", emote: "question" },
  beckon: { mood: "love", emote: "heart" },
  // Anxiety, not alarm. stand-lookout keeps the "!".
  fret: { mood: "confused", emote: "sweat" },
  nap: { mood: "sleepy", emote: "zzz" },
  // Quiet inward calm, so it stops reading as a second greet.
  meditate: { mood: "happy", emote: "dots" },
  // Watchful rather than doting, so it separates from offer-comfort.
  "keep-watch": { mood: "love", emote: "dots" },
  // Peeking is passive watching; inspect below keeps the pointed "?".
  peek: { mood: "thinking", emote: "dots" },
  inspect: { mood: "thinking", emote: "question" },
  // Intentionally unadorned: a routine is background life, not an event.
  "follow-routine": { mood: "working", emote: "none" },
  "offer-comfort": { mood: "love", emote: "heart" },
  "stand-lookout": { mood: "confused", emote: "exclaim" },
  // Second signature poses — each leans away from its sibling's cue so the two
  // beats read as distinct moments of the same personality.
  caper: { mood: "excited", emote: "note" },
  "check-in": { mood: "love", emote: "heart" },
  "hide-away": { mood: "thinking", emote: "dots" },
  "explore-nook": { mood: "thinking", emote: "question" },
  "tidy-up": { mood: "working", emote: "note" },
  posture: { mood: "excited", emote: "exclaim" },
  nurture: { mood: "love", emote: "heart" },
  scheme: { mood: "excited", emote: "sparkle" },
  lounge: { mood: "sleepy", emote: "zzz" },
  center: { mood: "happy", emote: "dots" },
  preen: { mood: "working", emote: "none" },
  "startle-scan": { mood: "confused", emote: "sweat" },
  appraise: { mood: "thinking", emote: "dots" },
};

function expressivePoseDurationMs(kind: ExpressivePoseKind, random: RandomSource): number {
  const { base, jitter } = EXPRESSIVE_POSE_DURATIONS[kind];
  return Math.round(base + random.next() * jitter);
}

// Personal space — a cosmetic "make-room" shuffle. Since pets are physical
// ghosts to each other (they pass through freely), two idle pets can settle on
// the exact same spot and render stacked. When that happens a grounded walker
// takes one small step aside — a low-stakes autonomous Decision that sets a
// motion target, not a separation force, so it can never reintroduce the
// grinding/trembling that came from solid bodies. It only fires when a pet is
// genuinely idle and unclaimed, so it never interrupts a session, chase, or
// reaction.
const MAKE_ROOM_REASON = "make-room";
// Trigger only on real stacking: centers within this fraction of a body width.
const PERSONAL_SPACE_TRIGGER_BODY_FRACTION = 0.55;
// How far aside to step, in body widths.
const PERSONAL_SPACE_STEP_BODY_WIDTHS = 1.1;
// A casual shuffle, not a dash.
const PERSONAL_SPACE_SPEED_FACTOR = 0.5;
// Claim lifetime for the shuffle (locomotion persists past it until arrival).
const MAKE_ROOM_CLAIM_MS = 1_200;
// Skip if clamping to bounds leaves less than this much room (pet against a
// wall): stepping into a wall would just micro-oscillate in the walk deadband.
const PERSONAL_SPACE_MIN_ROOM_PX = 12;

/** Personality-scaled rest length for an idle-stay decision. */
function idleStayDurationMs(p: PersonalityComponent, random: RandomSource): number {
  return Math.round(
    (IDLE_STAY_BASE_MS +
      (1 - p.extraversion) * IDLE_STAY_INTROVERSION_MS +
      random.next() * IDLE_STAY_JITTER_MS) *
      personalityIdleDurationScale(p.catalogId),
  );
}

/** Personality-scaled pause after reaching any destination. */
function arrivalDwellMs(p: PersonalityComponent, random: RandomSource | undefined): number {
  const jitter = random ? random.next() : 0.5;
  return Math.round(
    (ARRIVAL_DWELL_BASE_MS +
      (1 - p.extraversion) * ARRIVAL_DWELL_INTROVERSION_MS +
      jitter * ARRIVAL_DWELL_JITTER_MS) *
      personalityArrivalDwellScale(p.catalogId),
  );
}

/**
 * Applies a drive delta in place (component objects are mutated directly, same
 * pattern as ContactState/MotionTarget elsewhere in this file). No-ops when
 * the entity has no Drives component — satisfaction hooks stay optional so
 * pets without Drives are unaffected.
 */
function adjustDrive(
  components: ComponentStore,
  id: string,
  deltas: Partial<Pick<DrivesComponent, "social" | "energy" | "curiosity">>,
): void {
  const drives = components.getComponent(id, "Drives");
  if (!drives) return;
  if (deltas.social !== undefined) {
    drives.social = clampDrive(drives.social + deltas.social);
  }
  if (deltas.energy !== undefined) {
    drives.energy = clampDrive(drives.energy + deltas.energy);
  }
  if (deltas.curiosity !== undefined) {
    drives.curiosity = clampDrive(drives.curiosity + deltas.curiosity);
  }
}

// Duration of each claim in milliseconds
const CLAIM_DURATION_MS: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 2000,
  "agent-event": 5000,
  collision: 1000,
  // SocialInteractionSystem re-claims each tick while a session runs, so this
  // is only the fallback lifetime for a claim it stops refreshing.
  social: 750,
  autonomous: 500,
};

function isClaimed(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
): boolean {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  if (!existing) return false;
  if (existing.expiresAt <= now) return false;
  return BEHAVIOR_PRIORITY[existing.source] < BEHAVIOR_PRIORITY[source];
}

function isClaimedBySameOrHigherPriority(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
): boolean {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  if (!existing) return false;
  if (existing.expiresAt <= now) return false;
  return BEHAVIOR_PRIORITY[existing.source] <= BEHAVIOR_PRIORITY[source];
}

function claim(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
  reason: string,
  customExpiresAt?: number,
): void {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  // When a higher-priority (non-autonomous) source overwrites an autonomous
  // claim, carry the autonomous history forward so repeat-cooldowns survive.
  // Bookkeeping reasons (arrival dwell, idle speech) are not decisions — they
  // also carry history forward instead of becoming the history themselves.
  const recordsNewHistory = source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(reason);
  const existingIsRealAutonomous =
    existing?.source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(existing.reason);
  const lastAutonomousReason = recordsNewHistory
    ? reason
    : existingIsRealAutonomous
      ? existing.reason
      : (existing?.lastAutonomousReason ?? null);
  const lastAutonomousAt = recordsNewHistory
    ? now
    : existingIsRealAutonomous
      ? existing.decidedAt
      : (existing?.lastAutonomousAt ?? null);

  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source,
    decidedAt: now,
    expiresAt: customExpiresAt ?? now + CLAIM_DURATION_MS[source],
    reason,
    lastAutonomousReason,
    lastAutonomousAt,
  });
}

/** Write a plain spoken line (source "idle") to the pet's channel with a TTL. */
function setIdleSpeech(components: ComponentStore, id: string, line: string | null, now: number) {
  components.setComponent(
    id,
    utteranceChannel({ message: line, source: "idle", now, durationMs: SPEECH_BUBBLE_DURATION_MS }),
  );
}

function clearMotionTarget(components: ComponentStore, id: string): void {
  components.setComponent(id, {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: null,
  });
}

type VelocityWriter = {
  setVelocity(id: string, velocity: Partial<Vector>): void;
};

function stopPetMovement(
  components: ComponentStore,
  physics: VelocityWriter | undefined,
  id: string,
): void {
  clearMotionTarget(components, id);
  physics?.setVelocity(id, { x: 0, y: 0 });
}

function setAgentTaskState(
  components: ComponentStore,
  id: string,
  status: "working" | "waiting" | "completed" | "failed",
  event: { at: number; summary?: string },
  message: string | null,
  now: number,
): void {
  components.setComponent(id, {
    type: "AgentTaskState",
    status,
    since: event.at,
    summary: event.summary,
  });
  components.setComponent(id, {
    type: "AgentChannelState",
    source: "agent-task",
    status,
    label: agentTaskChannelLabel(status),
    message,
    updatedAt: event.at,
    // Freezing statuses (waiting/failed/completed) persist until the user
    // acknowledges the pet by interacting with it. A non-freezing "working"
    // status lets its spoken line expire on the shared TTL (clock-relative, so
    // it matches the expiration system) while the status capsule itself stays.
    expiresAt: statusFreezesMovement(status) ? null : now + SPEECH_BUBBLE_DURATION_MS,
  });
}

function agentTaskChannelLabel(status: "working" | "waiting" | "completed" | "failed"): string {
  switch (status) {
    case "working":
      return "Working";
    case "waiting":
      return "Waiting";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
  }
}

// The pet's spoken line lives on AgentChannelState.message. When its TTL lapses
// we clear the line; a plain utterance (no agent status) then has nothing left
// to show, so we drop the whole component and the pet falls quiet. An agent
// status (e.g. "working") keeps its shell so the capsule persists after the
// message fades. Freezing statuses carry a null expiry and never land here.
export function runAgentChannelMessageExpirationSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  const now = clock.now();
  components.forEach(["AgentChannelState"], (id, [channel]) => {
    if (channel.expiresAt == null) return;
    if (channel.expiresAt > now) return;
    if (channel.status == null) {
      components.removeComponent(id, "AgentChannelState");
      return;
    }
    channel.message = null;
    channel.expiresAt = null;
  });
}

export function runPetExpressionExpirationSystem(components: ComponentStore, clock: Clock): void {
  const now = clock.now();
  components.forEach(["PetExpressionState"], (id, [expression]) => {
    if (expression.expiresAt > now) return;
    components.removeComponent(id, "PetExpressionState");
  });
}

// ── Cursor play: petting detection (priority 1, alongside user-interaction) ──
//
// Runs right after UserInteractionBehaviorSystem so DragInteraction reflects
// this tick's pointer events. When the cursor lingers within a pet's body
// bounds and oscillates horizontally (stroking motion, not a swipe-through),
// claims user-interaction with reason "petting" and shows a love reaction.
// Skips any pet currently being dragged by the same pointer.
//
// Petting is also the only interaction that releases an agent task: any
// AgentTaskState (working/waiting/failed/completed) clears along with the
// movement hold and the agent-task channel badge. Pressing or dragging a pet
// deliberately does NOT release it, so a hold survives casual clicks until
// the user strokes the pet.

function findCursorState(components: ComponentStore): {
  position: { x: number; y: number } | null;
  samples: Array<{ at: number; position: { x: number; y: number } }>;
} | null {
  let found: {
    position: { x: number; y: number } | null;
    samples: Array<{ at: number; position: { x: number; y: number } }>;
  } | null = null;
  components.forEach(["CursorState"], (_id, [state]) => {
    if (!found) found = { position: state.position, samples: state.samples };
  });
  return found;
}

function horizontalOscillation(
  samples: Array<{ at: number; position: { x: number; y: number } }>,
  now: number,
): { reversals: number; displacement: number } {
  const recent = samples.filter((sample) => now - sample.at <= PETTING_OSCILLATION_WINDOW_MS);
  if (recent.length < 3) return { reversals: 0, displacement: 0 };

  let reversals = 0;
  let lastSign = 0;
  let minX = recent[0].position.x;
  let maxX = recent[0].position.x;
  for (let i = 1; i < recent.length; i += 1) {
    const dx = recent[i].position.x - recent[i - 1].position.x;
    minX = Math.min(minX, recent[i].position.x);
    maxX = Math.max(maxX, recent[i].position.x);
    if (dx === 0) continue;
    const sign = dx > 0 ? 1 : -1;
    if (lastSign !== 0 && sign !== lastSign) reversals += 1;
    lastSign = sign;
  }
  return { reversals, displacement: maxX - minX };
}

// Petting acknowledges whatever the agent reported: the movement hold lifts
// and the task state clears no matter the status — working included, so a
// stroke also dismisses a stale "working" report. Settled statuses
// (waiting/failed/completed) speak the personality acknowledge line and show
// that personality's own acknowledge cue (mood + emote), so the pet reacts in
// character to being accepted. A released "working" state has no acknowledge
// beat, so it keeps the plain petting love reaction set by the caller.
function releaseAgentTaskOnPetting(
  components: ComponentStore,
  id: string,
  now: number,
  random: RandomSource,
): void {
  const task = components.getComponent(id, "AgentTaskState");
  components.removeComponent(id, "TaskMovementHold");
  if (!task) return;

  const personality = components.getComponent(id, "Personality");
  const feedback = personalityAcknowledgeFeedback(personality?.catalogId, task.status, random);
  components.removeComponent(id, "AgentTaskState");

  const channel = components.getComponent(id, "AgentChannelState");
  if (channel?.source === "agent-task") {
    components.removeComponent(id, "AgentChannelState");
  }

  if (feedback) {
    const durationMs = SPEECH_BUBBLE_DURATION_MS;
    components.setComponent(
      id,
      utteranceChannel({ message: feedback.speech, source: "interaction", now, durationMs }),
    );
    // The release surfaces the personality's own acknowledge cue rather than a
    // unified heart — a playful pet sparkles, a lazy one keeps dozing. The
    // double-click dismissal keeps its fixed happy/note cue, so the two
    // gestures stay visually distinct on the same settled task (PET-23).
    components.setComponent(id, {
      type: "PetExpressionState",
      source: "acknowledge",
      mood: feedback.mood,
      emote: feedback.emote,
      label: null,
      startedAt: now,
      expiresAt: now + durationMs,
    });
    claim(components, id, "user-interaction", now, `acknowledge-${task.status}`, now + durationMs);
    recordPetExperience(components, id, "acknowledged", now);
  }
}

export function runPettingDetectionSystem(
  components: ComponentStore,
  clock: Clock,
  physics?: VelocityWriter,
  random: RandomSource = createSeededRandom(1),
): void {
  const now = clock.now();
  const cursor = findCursorState(components);
  if (!cursor?.position) return;
  const cursorPosition = cursor.position;

  const { reversals, displacement } = horizontalOscillation(cursor.samples, now);
  const isOscillating =
    reversals >= PETTING_MIN_REVERSALS && displacement <= PETTING_MAX_DISPLACEMENT_PX;
  if (!isOscillating) return;

  const drag = components.getComponent("user-interaction", "DragInteraction");

  components.forEach(["Transform", "PhysicsBody", "PetIdentity"], (id, [transform, body]) => {
    if (drag && drag.entityId === id) return;

    const halfW = body.width / 2 + PETTING_BODY_PADDING;
    const halfH = body.height / 2 + PETTING_BODY_PADDING;
    const withinBounds =
      Math.abs(cursorPosition.x - transform.position.x) <= halfW &&
      Math.abs(cursorPosition.y - transform.position.y) <= halfH;
    if (!withinBounds) return;

    const existing = components.getComponent(id, "BehaviorDecisionState");
    const alreadyPetting =
      existing?.source === "user-interaction" &&
      existing.reason === "petting" &&
      existing.expiresAt > now;

    if (alreadyPetting) {
      // Extend the reaction instead of restarting it every frame so
      // continuous petting doesn't reset the love expression's timer.
      existing.expiresAt = now + PETTING_DURATION_MS;
      const expression = components.getComponent(id, "PetExpressionState");
      if (expression && expression.source === "petting") {
        expression.expiresAt = now + PETTING_DURATION_MS;
      }
      return;
    }

    if (isClaimedBySameOrHigherPriority(components, id, "user-interaction", now)) return;

    claim(components, id, "user-interaction", now, "petting", now + PETTING_DURATION_MS);
    components.setComponent(id, { type: "Steering", mode: "stand" });
    stopPetMovement(components, physics, id);
    components.setComponent(id, {
      type: "PetExpressionState",
      source: "petting",
      mood: "love",
      emote: "heart",
      label: null,
      startedAt: now,
      expiresAt: now + PETTING_DURATION_MS,
    });
    recordPetExperience(components, id, "petted", now);
    // After the petting claim/expression, so a settled status's acknowledge
    // beat (claim + expression + speech) overrides the plain love reaction.
    releaseAgentTaskOnPetting(components, id, now, random);
  });
}

// ── Cursor play: hover reaction (priority 1, alongside user-interaction) ────
//
// When the cursor comes to rest over a pet that is currently moving, the pet
// stops on the spot and reacts according to its dominant personality trait.
// One-shot: the claim is NOT extended while the cursor stays put, so petting
// (which needs an unclaimed pet) can take over once the reaction expires. If
// the pet starts moving under the cursor again, the reaction re-triggers —
// hovering effectively holds the pet's attention.

type HoverReaction = {
  reason: string;
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
};

/**
 * Dominant-trait reaction. Ties resolve in listed order (anxious pets startle
 * before sociable pets greet) so the same personality always reacts the same
 * way. Conscientiousness has no hover pose — it shapes follow-through, not
 * social reactions.
 */
export function hoverReactionFor(personality: PersonalityComponent): HoverReaction {
  const candidates: Array<{ weight: number; reaction: HoverReaction }> = [
    {
      weight: personality.neuroticism,
      reaction: { reason: "hover-startle", mood: "confused", emote: "exclaim" },
    },
    {
      weight: personality.extraversion,
      reaction: { reason: "hover-greet", mood: "excited", emote: "sparkle" },
    },
    {
      weight: personality.agreeableness,
      reaction: { reason: "hover-affection", mood: "love", emote: "heart" },
    },
    {
      weight: personality.openness,
      reaction: { reason: "hover-observe", mood: "thinking", emote: "question" },
    },
  ];
  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.weight > best.weight) best = candidate;
  }
  return best.reaction;
}

export function runHoverReactionSystem(
  components: ComponentStore,
  clock: Clock,
  physics?: VelocityWriter,
): void {
  const now = clock.now();
  const cursor = findCursorState(components);
  if (!cursor?.position) return;
  const cursorPosition = cursor.position;

  const drag = components.getComponent("user-interaction", "DragInteraction");

  components.forEach(
    ["Transform", "PhysicsBody", "PetIdentity", "Personality"],
    (id, [transform, body, , personality]) => {
      if (drag && drag.entityId === id) return;

      // Only moving pets react — a parked or held pet has nothing to stop.
      const mode = components.getComponent(id, "Steering")?.mode ?? "stand";
      if (mode === "stand") return;
      if (components.getComponent(id, "TaskMovementHold")) return;

      const halfW = body.width / 2 + HOVER_BODY_PADDING;
      const halfH = body.height / 2 + HOVER_BODY_PADDING;
      const withinBounds =
        Math.abs(cursorPosition.x - transform.position.x) <= halfW &&
        Math.abs(cursorPosition.y - transform.position.y) <= halfH;
      if (!withinBounds) return;

      if (isClaimedBySameOrHigherPriority(components, id, "user-interaction", now)) return;

      const reaction = hoverReactionFor(personality);
      claim(
        components,
        id,
        "user-interaction",
        now,
        reaction.reason,
        now + HOVER_REACTION_DURATION_MS,
      );
      components.setComponent(id, { type: "Steering", mode: "stand" });
      stopPetMovement(components, physics, id);
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "hover",
        mood: reaction.mood,
        emote: reaction.emote,
        label: null,
        startedAt: now,
        expiresAt: now + HOVER_REACTION_DURATION_MS,
      });
    },
  );
}

// Priority 2: record external agent events onto the pet (task.started, etc.).
// This system only ingests agent facts — task/channel state, speech, activity,
// the priority claim, and the movement hold a freezing status implies. It does
// NOT touch Steering; movement/behavior is owned by the decision layer and
// user interaction.
export function runAgentTaskEventSystem(
  components: ComponentStore,
  events: WorldEvent[],
  clock: Clock,
  random: RandomSource = createSeededRandom(1),
): void {
  if (events.length === 0) return;
  const agentEvents = events.filter((event): event is AgentWorldEvent => event.kind === "agent");
  if (agentEvents.length === 0) return;
  const now = clock.now();

  components.forEach(
    ["AgentBinding", "SpeechProfile", "ActivityState"],
    (id, [agent, speechProfile, activity]) => {
      if (isClaimed(components, id, "agent-event", now)) return;

      for (const event of agentEvents) {
        if (agent.sourceId !== event.sourceId) continue;

        if (event.type === "task.started") {
          setAgentTaskState(
            components,
            id,
            "working",
            event,
            event.summary ?? resolveSpeechVariant(speechProfile.taskStarted, random),
            now,
          );
          applyTaskMovementHold(components, id, "working", event.at);
          activity.lastActiveAt = event.at;
          claim(components, id, "agent-event", now, "task.started");
          recordPetExperience(components, id, "task-started", now);
        }

        if (event.type === "task.waiting" || event.type === "attention.requested") {
          setAgentTaskState(
            components,
            id,
            "waiting",
            event,
            event.summary ?? resolveSpeechVariant(speechProfile.attentionNeeded, random),
            now,
          );
          applyTaskMovementHold(components, id, "waiting", event.at);
          claim(components, id, "agent-event", now, event.type);
          recordPetExperience(components, id, "task-waiting", now);
        }

        if (event.type === "task.failed") {
          setAgentTaskState(components, id, "failed", event, event.summary ?? "Task failed", now);
          applyTaskMovementHold(components, id, "failed", event.at);
          activity.lastActiveAt = event.at;
          claim(components, id, "agent-event", now, "task.failed");
          recordPetExperience(components, id, "task-failed", now);
        }

        if (event.type === "task.completed") {
          setAgentTaskState(
            components,
            id,
            "completed",
            event,
            event.summary ?? resolveSpeechVariant(speechProfile.taskCompleted, random),
            now,
          );
          applyTaskMovementHold(components, id, "completed", event.at);
          activity.lastActiveAt = event.at;
          claim(components, id, "agent-event", now, "task.completed");
          recordPetExperience(components, id, "task-completed", now);
        }
      }
    },
  );
}

/**
 * Add or clear the movement hold in step with the status the pet just entered.
 * Freezing statuses (waiting/failed/completed) hold the pet still; moving
 * statuses (working/idle) clear any prior hold so the pet is free again. This
 * runs only on an agent-event edge, so a user release between events survives
 * untouched — the hold is not continuously re-derived from status.
 */
function applyTaskMovementHold(
  components: ComponentStore,
  id: string,
  status: AgentTaskStatus,
  at: number,
): void {
  if (statusFreezesMovement(status)) {
    components.setComponent(id, { type: "TaskMovementHold", since: at });
  } else {
    components.removeComponent(id, "TaskMovementHold");
  }
}

// Hold pets still while a TaskMovementHold is present — a freezing task the
// user has not released yet.
export function runTaskMovementHoldSystem(
  components: ComponentStore,
  physics: VelocityWriter,
): void {
  components.forEach(["TaskMovementHold"], (id) => {
    stopPetMovement(components, physics, id);
  });
}

export function runWorkingBehaviorSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(
    ["AgentTaskState", "Personality", "MotionTarget", "Transform"],
    (id, [agentTask, personality, motion, transform]) => {
      if (agentTask.status !== "working") return;
      if (motion.targetPosition !== null || motion.targetEntityId !== null) return;

      const existing = components.getComponent(id, "BehaviorDecisionState");
      if (existing && existing.expiresAt > now) return;

      const distractionScore =
        (1 - personality.conscientiousness) * 0.7 + personality.extraversion * 0.3;

      if (distractionScore > 0.5) {
        const target = pickWanderPosition(
          transform.position.x,
          transform.position.y,
          bounds,
          random,
          "near",
          personality,
          petWidth(components, id),
        );
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: target,
        });
        setPetSteering(components, id, "pursue");
        claim(components, id, "autonomous", now, "working-wander", now + 750);
        return;
      }

      claim(components, id, "autonomous", now, "working-focus", now + 1500);
    },
  );
}

// Priority 3: Collision avoidance (entity overlap).
export function runCollisionBehaviorSystem(
  components: ComponentStore,
  _bounds: { x?: number; y?: number; width: number; height: number },
  clock: Clock,
): void {
  const now = clock.now();

  type Collidable = {
    id: string;
    x: number;
    y: number;
    halfW: number;
    halfH: number;
    mode: string;
    targetX: number | null;
    targetY: number | null;
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
  type CollisionCandidate = { id: string; x: number; y: number };

  const entities: Collidable[] = [];
  components.forEach(
    ["Transform", "PhysicsBody", "Steering", "MotionTarget"],
    (id, [transform, body, intent, motion]) => {
      entities.push({
        id,
        x: transform.position.x,
        y: transform.position.y,
        halfW: body.width / 2,
        halfH: body.height / 2,
        mode: intent.mode,
        targetX: motion.targetPosition?.x ?? null,
        targetY: motion.targetPosition?.y ?? null,
        motion,
      });
    },
  );

  // Pass 1 — expire stale collision claims for entities that are no longer
  // overlapping.  Without this, a pet that successfully moved to its avoidance
  // position stays frozen idle until the 1 s claim expires even though it is
  // already clear of the other entity.  Expiring immediately lets
  // BehaviorDecisionSystem pick a new behavior in the same frame.
  for (const entity of entities) {
    if (components.getComponent(entity.id, "ClimbingTag")) continue;
    if (components.getComponent(entity.id, "AirborneTag")) {
      const existing = components.getComponent(entity.id, "BehaviorDecisionState");
      if (existing?.source === "collision" && existing.expiresAt > now) {
        existing.expiresAt = now;
        components.removeComponent(entity.id, "PendingReaction");
      }
      continue;
    }
    const existing = components.getComponent(entity.id, "BehaviorDecisionState");
    if (existing?.source !== "collision" || existing.expiresAt <= now) continue;

    const stillOverlapping =
      !!components.getComponent(entity.id, "PetCollision") ||
      entities.some(
        (c) =>
          c.id !== entity.id &&
          Math.abs(c.x - entity.x) < entity.halfW + c.halfW &&
          Math.abs(c.y - entity.y) < entity.halfH + c.halfH,
      );

    if (!stillOverlapping) {
      existing.expiresAt = now; // allow BehaviorDecisionSystem to act this frame
    }
  }

  // Pass 2 — write PendingReaction for currently-overlapping entities.
  // Phase 4: pets "freeze" until reactsAt; BehaviorDecisionSystem then picks
  // a personality-shaped response (collision-flee/engage/avoid/unfazed).
  for (const entity of entities) {
    // Do not disrupt a climbing entity or one that is mid-approach to a surface.
    if (components.getComponent(entity.id, "ClimbingTag")) continue;
    if (components.getComponent(entity.id, "AirborneTag")) continue;
    if (components.getComponent(entity.id, "ClimbIntentState")?.phase === "approaching") continue;
    const agentTask = components.getComponent(entity.id, "AgentTaskState");
    const isWorking = agentTask?.status === "working";
    if (isWorking) {
      if (isClaimed(components, entity.id, "collision", now)) continue;
    } else if (isClaimedBySameOrHigherPriority(components, entity.id, "collision", now)) {
      continue;
    }
    // Skip if a reaction is already pending (avoid overwriting mid-deliberation).
    if (!isWorking && components.getComponent(entity.id, "PendingReaction")) continue;

    const collision: CollisionCandidate | undefined =
      matterPetCollisionCandidate(components, entity, entities) ??
      entities.find(
        (c) =>
          c.id !== entity.id &&
          Math.abs(c.x - entity.x) < entity.halfW + c.halfW &&
          Math.abs(c.y - entity.y) < entity.halfH + c.halfH,
      );
    if (!collision) continue;
    // B2: contact with a co-participant in the same session is expected
    // choreography (greet gaps close in, chases catch), never a startle. This
    // also covers the brief windows where the social claim is not live — e.g.
    // right at teardown before the afterglow claim lands. Matching by
    // sessionId (not partnerId) keeps every member of a group immune to every
    // other, not just its representative partner.
    const sessionMember = components.getComponent(entity.id, "SocialSessionMember");
    if (sessionMember) {
      const otherMember = components.getComponent(collision.id, "SocialSessionMember");
      if (otherMember?.sessionId === sessionMember.sessionId) continue;
    }
    // B3: already reacted to this particular neighbor recently — coexist.
    if (isPairCoolingDown(components, entity.id, collision.id, now)) continue;
    if (isWorking) {
      const personality = components.getComponent(entity.id, "Personality");
      if (personality) {
        const expression = workingCollisionExpression(personality);
        components.setComponent(entity.id, {
          type: "PetExpressionState",
          source: "collision",
          ...expression,
          startedAt: now,
          expiresAt: now + workingCollisionExpressionDurationMs(personality),
        });
      }
      components.removeComponent(entity.id, "PendingReaction");

      components.setComponent(entity.id, {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      });
      components.setComponent(entity.id, {
        type: "Steering" as const,
        mode: "pursue",
      });

      const existing = components.getComponent(entity.id, "BehaviorDecisionState");
      if (
        existing &&
        (existing.source === "collision" ||
          (existing.source === "autonomous" &&
            WORKING_COLLISION_EXPIRABLE_AUTONOMOUS_REASONS.has(existing.reason)))
      ) {
        existing.expiresAt = now;
      }

      recordPairReaction(components, entity.id, collision.id, now);
      recordPetExperience(components, entity.id, "startled", now);
      continue;
    }
    if (isEscapingCollisionFlee(components, entity, collision)) continue;

    const personality = components.getComponent(entity.id, "Personality");
    const latency = personality ? reactionLatencyMs(personality, "collision") : 400;
    const reactsAt = now + latency;

    components.setComponent(entity.id, {
      type: "PendingReaction",
      source: "collision",
      triggeredAt: now,
      reactsAt,
      context: {
        otherEntityId: collision.id,
        otherPosition: { x: collision.x, y: collision.y },
      },
    } satisfies PendingReactionComponent);
    recordPetExperience(components, entity.id, "startled", now);

    // Freeze the pet immediately: clear existing MotionTarget and reset intent
    // to idle so locomotion systems see no active goal and the pet stops.
    // Without this, a pet heading toward its approach-pet target keeps flying
    // into the collider throughout the deliberation window.
    components.setComponent(entity.id, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    components.setComponent(entity.id, { type: "Steering", mode: "stand" });

    // Hold the claim until reactsAt so BehaviorDecisionSystem skips this pet
    // during the deliberation window.
    claim(components, entity.id, "collision", now, "entity overlap", reactsAt);
    recordPairReaction(components, entity.id, collision.id, now);
  }
}

// ── Phase 4: Reaction latency ─────────────────────────────────────────────
//
// High N (anxiety) → longer freeze before reacting.
// High E (extraversion) → snappier reaction.
// Clamped to 0..2000 ms.

function matterPetCollisionCandidate(
  components: ComponentStore,
  entity: { id: string },
  entities: Array<{ id: string; x: number; y: number }>,
): { id: string; x: number; y: number } | undefined {
  const petCollision = components.getComponent(entity.id, "PetCollision");
  if (!petCollision) return undefined;

  const liveEntity = entities.find((candidate) => candidate.id === petCollision.otherEntityId);
  return (
    liveEntity ?? {
      id: petCollision.otherEntityId,
      x: petCollision.otherPosition.x,
      y: petCollision.otherPosition.y,
    }
  );
}

function isEscapingCollisionFlee(
  components: ComponentStore,
  entity: {
    id: string;
    x: number;
    y: number;
    mode: string;
    targetX: number | null;
    targetY: number | null;
  },
  collision: { x: number; y: number },
): boolean {
  if (entity.mode !== "pursue") return false;
  if (entity.targetX == null || entity.targetY == null) return false;

  const decision = components.getComponent(entity.id, "BehaviorDecisionState");
  if (decision?.reason !== "collision-flee") return false;

  const currentDistanceSquared = (entity.x - collision.x) ** 2 + (entity.y - collision.y) ** 2;
  const targetDistanceSquared =
    (entity.targetX - collision.x) ** 2 + (entity.targetY - collision.y) ** 2;
  const movementX = entity.targetX - entity.x;
  const movementY = entity.targetY - entity.y;
  const awayX = entity.x - collision.x;
  const awayY = entity.y - collision.y;

  return (
    targetDistanceSquared > currentDistanceSquared && movementX * awayX + movementY * awayY > 0
  );
}

function reactionLatencyMs(p: PersonalityComponent, source: ReactionSource): number {
  const baseMs = source === "collision" ? 400 : source === "agent-event" ? 250 : 200;
  const latency = baseMs * (1 + p.neuroticism * 1.5 - p.extraversion * 0.5);
  return Math.max(0, Math.min(2000, latency));
}

// ── Phase 4: Collision response score functions ───────────────────────────

function workingCollisionExpressionDurationMs(personality: PersonalityComponent): number {
  const duration =
    550 +
    personality.neuroticism * 350 +
    (1 - personality.agreeableness) * 200 +
    personality.extraversion * 100 -
    personality.conscientiousness * 250;
  return Math.round(clamp(duration, 350, 900));
}

function workingCollisionExpression(personality: PersonalityComponent): {
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
  label: string | null;
} {
  if (personality.neuroticism >= 0.65 || personality.agreeableness <= 0.3) {
    return { mood: "confused", emote: "exclaim", label: "!" };
  }

  if (personality.agreeableness >= 0.75 && personality.neuroticism <= 0.35) {
    return { mood: "love", emote: "heart", label: null };
  }

  if (personality.conscientiousness >= 0.75 || personality.neuroticism <= 0.2) {
    return { mood: "working", emote: "none", label: null };
  }

  return { mood: "thinking", emote: "question", label: null };
}

function scoreCollisionFlee(p: PersonalityComponent): number {
  // N → flee instinct; A → reduce (agreeable pets less likely to flee)
  return 0.2 + p.neuroticism * 0.7 - p.agreeableness * 0.5;
}

function scoreCollisionEngage(p: PersonalityComponent): number {
  // E + A → curiosity/warmth; N → avoidance
  return 0.2 + p.extraversion * 0.5 + p.agreeableness * 0.5 - p.neuroticism * 0.4;
}

function scoreCollisionAvoid(): number {
  // Always a neutral fallback — perpendicular sidestep
  return 0.4;
}

function scoreCollisionJump(p: PersonalityComponent): number {
  return 1.2 + p.extraversion * 0.45 + p.openness * 0.25 + p.neuroticism * 0.15;
}

function scoreCollisionStay(p: PersonalityComponent): number {
  // A + calm introversion → comfortable staying close without re-approaching.
  return 0.05 + p.agreeableness * 0.3 + (1 - p.extraversion) * 1 + (1 - p.neuroticism) * 0.1;
}

function scoreCollisionUnfazed(p: PersonalityComponent): number {
  // Low N → composure; high N → less likely to shrug it off
  return 0.15 + (1 - p.neuroticism) * 0.4;
}

function constrainCollisionDirectionForLocomotion(
  components: ComponentStore,
  id: string,
  otherId: string | undefined,
  away: Vector,
): Vector {
  if (!isHorizontalOnlyCollisionResponse(components, id)) return away;
  if (Math.abs(away.x) > 0.2) {
    return { x: Math.sign(away.x), y: 0 };
  }

  return {
    x: fallbackHorizontalDirection(id, otherId),
    y: 0,
  };
}

function isHorizontalOnlyCollisionResponse(components: ComponentStore, id: string): boolean {
  return (
    !!components.getComponent(id, "WalkingTag") &&
    !components.getComponent(id, "FlyingTag") &&
    !components.getComponent(id, "ClimbingTag")
  );
}

function fallbackHorizontalDirection(id: string, otherId: string | undefined): -1 | 1 {
  if (!otherId) return -1;
  return id.localeCompare(otherId) <= 0 ? -1 : 1;
}

function isPendingReactionStillOverlapping(
  components: ComponentStore,
  id: string,
  pendingReaction: PendingReactionComponent,
): boolean {
  const otherId = pendingReaction.context.otherEntityId;
  if (!otherId) return false;

  const transform = components.getComponent(id, "Transform");
  const body = components.getComponent(id, "PhysicsBody");
  const otherTransform = components.getComponent(otherId, "Transform");
  const otherBody = components.getComponent(otherId, "PhysicsBody");
  if (!transform || !body || !otherTransform || !otherBody) return false;

  return (
    Math.abs(transform.position.x - otherTransform.position.x) <
      body.width / 2 + otherBody.width / 2 &&
    Math.abs(transform.position.y - otherTransform.position.y) <
      body.height / 2 + otherBody.height / 2
  );
}

// Priority 4: Autonomous idle behaviors (speech, wandering).
export function runAutonomousBehaviorSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource = createSeededRandom(1),
): void {
  const now = clock.now();

  // Idle conversation — only when no higher-priority claim holds
  components.forEach(
    ["IdleConversation", "SpeechProfile", "ActivityState"],
    (id, [idleConversation, speechProfile, activity]) => {
      if (isClaimed(components, id, "autonomous", now)) return;
      // Already saying something (social line, agent status, …)? Stay quiet.
      if (components.getComponent(id, "AgentChannelState")?.message) return;
      if (clock.now() - activity.lastActiveAt >= idleConversation.idleAfterMs) {
        setIdleSpeech(
          components,
          id,
          resolveSpeechVariant(speechProfile.idleCompanion, random),
          now,
        );
        // Reset the idle timer so the *next* chatter is another full
        // idleAfterMs away. Without this, lastActiveAt stays frozen (it is only
        // otherwise bumped by agent events), the threshold remains crossed, and
        // the pet re-chatters every time this claim lapses (~1.5s) forever —
        // making idleConversationMs meaningless after the first utterance.
        activity.lastActiveAt = now;
        // Hold the claim for the bubble's whole lifetime, not the 500ms
        // autonomous default: otherwise the "chatting" activity flickers off
        // a second before the speech bubble it describes disappears.
        claim(
          components,
          id,
          "autonomous",
          now,
          IDLE_CONVERSATION_REASON,
          now + SPEECH_BUBBLE_DURATION_MS,
        );
      }
    },
  );
}

// Personal-space "make-room" shuffle. Runs at the end of BEHAVIOR, so it only
// sees pets that ended this frame genuinely idle and unclaimed. A grounded
// walker stacked on top of another pet steps one body-width aside (a motion
// target, handed to Steering — never a force), then settles via the normal
// arrival + dwell path. See MAKE_ROOM_REASON for why this exists.
export function runPersonalSpaceSystem(
  components: ComponentStore,
  clock: Clock,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(
    ["PetCollision", "Steering", "MotionTarget", "Transform", "PetIdentity"],
    (id, [collision, intent, motion, transform]) => {
      if (intent.mode !== "stand") return;
      if (motion.targetPosition !== null || motion.targetEntityId !== null) {
        return;
      }
      // Ground walkers only; flyers/climbers overlapping reads fine as-is.
      if (!components.getComponent(id, "WalkingTag")) return;
      if (components.getComponent(id, "FlyingTag")) return;
      if (components.getComponent(id, "ClimbingTag")) return;
      const contact = components.getComponent(id, "ContactState");
      if (contact && !contact.grounded) return;
      // A pending startle is about to react (or greet) — don't pre-empt it.
      if (components.getComponent(id, "PendingReaction")) return;
      // Any live claim (session, chase, reaction, user hold, even a rest dwell)
      // owns the pet: leave it be. autonomous is the lowest rank, so this is
      // true whenever *any* claim is still live.
      if (isClaimedBySameOrHigherPriority(components, id, "autonomous", now)) {
        return;
      }
      if (isAutonomousRepeatCoolingDown(components, id, MAKE_ROOM_REASON, now)) {
        return;
      }

      const body = components.getComponent(id, "PhysicsBody");
      const width = body?.width ?? DEFAULT_BEHAVIOR_BODY_WIDTH;
      const otherX =
        components.getComponent(collision.otherEntityId, "Transform")?.position.x ??
        collision.otherPosition.x;
      const dx = transform.position.x - otherX;
      // Only real stacking, not incidental edge contact.
      if (Math.abs(dx) > width * PERSONAL_SPACE_TRIGGER_BODY_FRACTION) return;

      const direction =
        Math.abs(dx) > width * 0.15
          ? Math.sign(dx)
          : fallbackHorizontalDirection(id, collision.otherEntityId);
      const targetX = clampToBoundsX(
        transform.position.x + direction * width * PERSONAL_SPACE_STEP_BODY_WIDTHS,
        bounds,
        COLLISION_TARGET_MARGIN,
      );
      // Against a wall with nowhere to go — better to stay stacked than to
      // grind into the boundary.
      if (Math.abs(targetX - transform.position.x) < PERSONAL_SPACE_MIN_ROOM_PX) {
        return;
      }

      components.setComponent(id, {
        type: "MotionTarget",
        targetEntityId: null,
        targetPosition: { x: targetX, y: transform.position.y },
        speedFactor: PERSONAL_SPACE_SPEED_FACTOR,
      });
      intent.mode = "pursue";
      claim(components, id, "autonomous", now, MAKE_ROOM_REASON, now + MAKE_ROOM_CLAIM_MS);
    },
  );
}

/**
 * A pet that just finished a movement earns a personality-length beat of
 * stillness before the decision loop may run again — back-to-back walks are
 * what read as aimless pacing. The dwell never steals the pet from any live
 * claim (social sessions, collisions, user holds all keep ownership); it only
 * fills the quiet gap after a completed, unclaimed movement.
 */
function applyArrivalDwell(
  components: ComponentStore,
  id: string,
  now: number,
  random: RandomSource | undefined,
): void {
  const personality = components.getComponent(id, "Personality");
  if (!personality) return;
  // A live claim blocks the dwell — unless it is itself just bookkeeping
  // (idle-companion speech re-claims every ~1.5s and must not eat rest beats).
  const existing = components.getComponent(id, "BehaviorDecisionState");
  const blockedByLiveClaim =
    !!existing &&
    existing.expiresAt > now &&
    !(existing.source === "autonomous" && BOOKKEEPING_AUTONOMOUS_REASONS.has(existing.reason));
  if (blockedByLiveClaim) {
    return;
  }
  claim(
    components,
    id,
    "autonomous",
    now,
    ARRIVAL_DWELL_REASON,
    now + arrivalDwellMs(personality, random),
  );
}

// Arrival detection (runs in UPDATE phase, after locomotion decisions).
// Not a BEHAVIOR-phase system: it detects arrival at any target regardless of
// which source directed the pet there.
export function runArrivalBehaviorSystem(
  components: ComponentStore,
  clock?: Clock,
  random?: RandomSource,
): void {
  components.forEach(
    ["Steering", "Transform", "MotionTarget", "WandersOnArrival"],
    (id, [intent, transform, motion, wandersOnArrival]) => {
      if (motion.targetEntityId) {
        const decision = components.getComponent(id, "BehaviorDecisionState");
        const decisionToken = components.getComponent(id, "BehaviorDecisionToken");
        const isApproachingPet =
          intent.mode === "pursue" &&
          (decisionToken?.kind === "approach-pet" || decision?.reason === "approach-pet");

        if (isApproachingPet) {
          const startedAt =
            decisionToken?.kind === "approach-pet"
              ? decisionToken.decidedAt
              : (decision?.decidedAt ?? 0);
          const now = clock?.now() ?? startedAt;
          const perception = components.getComponent(id, "Perception");
          const targetPet = perception?.nearbyPets.find((pet) => pet.id === motion.targetEntityId);
          const targetPosition = targetPet?.position ?? motion.targetPosition;
          if (targetPosition) {
            const dx = targetPosition.x - transform.position.x;
            const dy = targetPosition.y - transform.position.y;
            const isFlying = !!components.getComponent(id, "FlyingTag");
            const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
            if (dist <= APPROACH_PET_SUCCESS_RADIUS) {
              motion.targetEntityId = null;
              motion.targetPosition = null;
              intent.mode = "stand";
              components.setComponent(id, {
                type: "BehaviorDecisionState",
                source: "autonomous",
                decidedAt: now,
                expiresAt: now + APPROACH_PET_SUCCESS_CUE_MS,
                reason: "approach-pet-success",
                lastAutonomousReason: decision?.lastAutonomousReason ?? "approach-pet",
                lastAutonomousAt: decision?.lastAutonomousAt ?? startedAt,
              });
              components.removeComponent(id, "BehaviorDecisionToken");
              // Catching another pet is a substantial social win.
              adjustDrive(components, id, {
                social: -APPROACH_PET_SUCCESS_SOCIAL_REFILL,
              });
              return;
            }
          }

          if (now - startedAt > APPROACH_PET_TIMEOUT_MS) {
            motion.targetEntityId = null;
            motion.targetPosition = null;
            intent.mode = "stand";
            if (decision) decision.expiresAt = now;
            components.removeComponent(id, "BehaviorDecisionToken");
            return;
          }

          return;
        }

        const isChasingCursor =
          intent.mode === "pursue" &&
          (decisionToken?.kind === "chase-cursor" || decision?.reason === "chase-cursor");

        if (isChasingCursor) {
          const startedAt =
            decisionToken?.kind === "chase-cursor"
              ? decisionToken.decidedAt
              : (decision?.decidedAt ?? 0);
          const now = clock?.now() ?? startedAt;
          const perception = components.getComponent(id, "Perception");
          const anchor = perception?.userAnchor;
          const targetPosition =
            anchor && anchor.id === motion.targetEntityId ? anchor.position : motion.targetPosition;
          if (targetPosition) {
            const dx = targetPosition.x - transform.position.x;
            const dy = targetPosition.y - transform.position.y;
            const isFlying = !!components.getComponent(id, "FlyingTag");
            const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
            if (dist <= CHASE_CURSOR_SUCCESS_RADIUS) {
              motion.targetEntityId = null;
              motion.targetPosition = null;
              intent.mode = "stand";
              components.setComponent(id, {
                type: "BehaviorDecisionState",
                source: "autonomous",
                decidedAt: now,
                expiresAt: now + CHASE_CURSOR_SUCCESS_CUE_MS,
                reason: "chase-cursor-success",
                lastAutonomousReason: decision?.lastAutonomousReason ?? "chase-cursor",
                lastAutonomousAt: decision?.lastAutonomousAt ?? startedAt,
              });
              components.setComponent(id, {
                type: "PetExpressionState",
                source: "chase-cursor",
                mood: "excited",
                emote: "sparkle",
                label: null,
                startedAt: now,
                expiresAt: now + CHASE_CURSOR_SUCCESS_CUE_MS,
              });
              components.removeComponent(id, "BehaviorDecisionToken");
              return;
            }
          }

          if (now - startedAt > CHASE_CURSOR_TIMEOUT_MS) {
            motion.targetEntityId = null;
            motion.targetPosition = null;
            intent.mode = "stand";
            if (decision) decision.expiresAt = now;
            components.removeComponent(id, "BehaviorDecisionToken");
            return;
          }

          return;
        }

        if (intent.mode !== "arrive") return;
        const perception = components.getComponent(id, "Perception");
        const anchor = perception?.userAnchor;
        if (!anchor) return;
        // MotionTargetSystem may set a concrete stop-short position for entity
        // targets such as user-anchor. Arrival must compare against that resolved
        // position, not the entity center, otherwise walkers stop at their target
        // while the entity target remains permanently active.
        const arrivalTarget = motion.targetPosition ?? anchor.position;
        // Flying pets can close the gap in both axes; walking pets are locked to
        // the ground and can only reduce horizontal distance — use |dx| so arrival
        // fires as soon as the walk system stops (they share the same threshold).
        const dx = arrivalTarget.x - transform.position.x;
        const dy = arrivalTarget.y - transform.position.y;
        const isFlying = !!components.getComponent(id, "FlyingTag");
        const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
        if (dist > wandersOnArrival.arrivalRadius) return;
        intent.mode = "stand";
        motion.targetEntityId = null;
        motion.targetPosition = null;
        if (clock) applyArrivalDwell(components, id, clock.now(), random);
        return;
      }

      const target = motion.targetPosition;
      if (!target) return;

      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (climbIntent?.phase === "approaching") return;

      const climbing = components.getComponent(id, "ClimbingTag");
      const delta = climbing
        ? Math.abs(target.y - transform.position.y)
        : Math.abs(target.x - transform.position.x);

      if (delta > wandersOnArrival.arrivalRadius) {
        // No-progress watchdog (grounded pets only; climbing has its own phase
        // handling). A walker wedged against an interior monitor step can never
        // shrink `delta`, so without this it would hold this target forever.
        if (clock && !climbing) {
          const now = clock.now();
          if (
            motion.progressBest === undefined ||
            delta < motion.progressBest - WANDER_PROGRESS_EPSILON
          ) {
            motion.progressBest = delta;
            motion.progressAt = now;
          } else if (
            motion.progressAt !== undefined &&
            now - motion.progressAt > WANDER_STUCK_TIMEOUT_MS
          ) {
            // Stuck: drop the unreachable target and re-decide next tick. No
            // arrival dwell — this is a give-up, not a real arrival, so the pet
            // should immediately pick a fresh (reachable) target.
            clearMotionTarget(components, id);
            intent.mode = "stand";
          }
        }
        return;
      }
      motion.targetEntityId = null;
      motion.targetPosition = null;
      intent.mode = "stand";
      if (clock) applyArrivalDwell(components, id, clock.now(), random);
    },
  );
}

// ── Softmax sampling ─────────────────────────────────────────────────────
//
// Temperature T = T_BASE * (1 + ALPHA_T * neuroticism):
//   • Low N  (e.g. 0.1) → T ≈ 0.28  → distribution concentrated on top scorer
//   • High N (e.g. 0.9) → T ≈ 0.52  → distribution is more uniform / erratic
//
// A single random.next() call per selection; no per-candidate jitter.

const T_BASE = 0.25;
const ALPHA_T = 1.2;

function softmaxSample(
  candidates: Candidate[],
  neuroticism: number,
  random: RandomSource,
): { winner: Candidate; trace: BehaviorDecisionSelectionTrace } {
  const T = T_BASE * (1 + ALPHA_T * neuroticism);
  // Subtract max before exp() to prevent overflow when future phases add
  // high-magnitude scores (approach-pet, flee, collision response, etc.).
  let maxScore = -Infinity;
  for (const candidate of candidates) {
    if (candidate.score > maxScore) maxScore = candidate.score;
  }

  const weights = candidates.map((candidate) => Math.exp((candidate.score - maxScore) / T));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const randomRoll = random.next();
  let r = randomRoll * total;
  let winner = candidates[candidates.length - 1];
  for (const [index, candidate] of candidates.entries()) {
    r -= weights[index];
    if (r <= 0) {
      winner = candidate;
      break;
    }
  }

  let cumulativeProbability = 0;
  const trace: BehaviorDecisionSelectionTrace = {
    temperature: T,
    randomRoll,
    totalWeight: total,
    selectedKind: winner.kind,
    candidates: candidates.map((candidate, index) => {
      const probability = weights[index] / total;
      cumulativeProbability += probability;
      return {
        kind: candidate.kind,
        score: candidate.score,
        weight: weights[index],
        probability,
        cumulativeProbability,
        selected: candidate.kind === winner.kind,
      };
    }),
  };

  return { winner, trace };
}

// ── BehaviorDecisionSystem helpers ────────────────────────────────────────

type TokenFields = Omit<BehaviorDecisionTokenComponent, "type" | "decidedAt" | "consumed" | "kind">;

type Candidate = {
  kind: BehaviorDecisionKind;
  score: number;
  build(): TokenFields;
};

function pushCandidate(
  candidates: Candidate[],
  components: ComponentStore,
  id: string,
  now: number,
  candidate: Candidate,
): void {
  if (isAutonomousRepeatCoolingDown(components, id, candidate.kind, now)) return;
  candidates.push(candidate);
}

function isAutonomousRepeatCoolingDown(
  components: ComponentStore,
  id: string,
  reason: string,
  now: number,
): boolean {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (!decision) return false;

  // Use the most recent autonomous decision, whether it is the current claim
  // (source === "autonomous") or was carried over when a higher-priority
  // claim (collision, agent-event) or a bookkeeping claim overwrote it.
  const isRealAutonomous =
    decision.source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(decision.reason);
  const lastReason = isRealAutonomous ? decision.reason : decision.lastAutonomousReason;
  const lastAt = isRealAutonomous ? decision.decidedAt : decision.lastAutonomousAt;

  if (lastReason !== reason || lastAt == null) return false;

  const cooldownMs = AUTONOMOUS_REPEAT_COOLDOWN_MS[reason] ?? 0;
  return now - lastAt < cooldownMs;
}

// ── OCEAN score functions ────────────────────────────────────────────────────
// Each reads PersonalityComponent axes plus, where noted, an optional Drives
// snapshot. `drives` is undefined for pets built before this feature (or in
// tests that never attach one) — every drives-aware function must fall back
// to its pre-Drives formula in that case so old callers see identical scores.
// Drive contributions use driveResponseCurve (see features/drives/systems.ts)
// so a need only meaningfully sways the decision once it crosses ~0.7-0.8.

// ── Personality modulation of drive pull ─────────────────────────────────────
// A saturated need would otherwise add the *same* weight to every pet's score,
// collapsing temperaments toward one behaviour once a drive tops out. Scaling
// each drive term by how much this personality cares about that need keeps the
// pull — loneliness, boredom, fatigue — proportional to character, so the same
// unmet need moves an extravert and an aloof pet by very different amounts.
//
// sensitivity is a 0..1 trait blend (weights sum to 1, so no clamp is needed);
// driveWeight maps it onto a 0.4x..1.6x multiplier. The 0.5 midpoint reproduces
// the originally tuned weight while trait extremes spread the response ~4x.
function driveWeight(weight: number, sensitivity: number): number {
  return weight * (0.4 + sensitivity * 1.2);
}

// Extraverts and agreeable pets feel loneliness as a stronger pull to company.
function socialSensitivity(p: PersonalityComponent): number {
  return p.extraversion * 0.6 + p.agreeableness * 0.4;
}

// Open pets are the ones boredom actually goads into exploring.
function curiositySensitivity(p: PersonalityComponent): number {
  return p.openness;
}

// The undisciplined and the introverted give in to fatigue early; conscientious,
// energetic pets push through it.
function restSensitivity(p: PersonalityComponent): number {
  return (1 - p.conscientiousness) * 0.6 + (1 - p.extraversion) * 0.4;
}

function scoreWanderNear(p: PersonalityComponent): number {
  // N (neuroticism) → wary, prefers short local moves; O (openness) → slight boost
  return 0.3 + p.openness * 0.1 + p.neuroticism * 0.4;
}

function scoreWanderFar(p: PersonalityComponent, drives?: DrivesComponent): number {
  // O (openness) → exploration drive; N (neuroticism) → reluctance to venture far
  const base = 0.3 + p.openness * 0.7 - p.neuroticism * 0.2;
  if (!drives) return base;
  // Curiosity (boredom) → unresolved novelty-seeking pushes toward exploring far.
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.5, curiositySensitivity(p));
}

function scoreSeekUser(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E (extraversion) + A (agreeableness) → approach user; N → avoidance
  const base = 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.3 - p.neuroticism * 0.3;
  if (!drives) return base;
  // Social need also nudges toward the user, smaller weight than approach-pet.
  return base + driveResponseCurve(drives.social) * driveWeight(0.3, socialSensitivity(p));
}

function scoreJump(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E (extraversion) → action energy; O (openness) → novelty seeking
  const base = 0.2 + p.extraversion * 0.4 + p.openness * 0.3;
  if (!drives) return base;
  // Low energy (tired) suppresses the urge to jump.
  return base - driveResponseCurve(1 - drives.energy) * driveWeight(0.5, restSensitivity(p));
}

function scoreClimb(p: PersonalityComponent, drives?: DrivesComponent): number {
  // O (openness) → exploration; E (extraversion) → physical energy
  const base = 0.2 + p.openness * 0.6 + p.extraversion * 0.2;
  if (!drives) return base;
  // Curiosity (boredom) → climbing resolves the need for novelty.
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.4, curiositySensitivity(p));
}

function scoreIdleStay(p: PersonalityComponent, drives?: DrivesComponent): number {
  // Low E → reduced need for activity; N (neuroticism) → cautious stillness
  const base = 0.25 + (1 - p.extraversion) * 0.3 + p.neuroticism * 0.2;
  if (!drives) return base;
  // Low energy (tired) → resting becomes strongly preferred.
  return base + driveResponseCurve(1 - drives.energy) * driveWeight(0.5, restSensitivity(p));
}

// Phase 3 — social interaction score functions (require Perception.nearbyPets)

function scoreApproachPet(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E + A → social draw; N → reluctance
  const base = 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.4 - p.neuroticism * 0.3;
  if (!drives) return base;
  // Social need (loneliness) → strongest drive pull toward another pet.
  return base + driveResponseCurve(drives.social) * driveWeight(0.6, socialSensitivity(p));
}

function scoreFleeFromPet(p: PersonalityComponent): number {
  // N → flight instinct; A → reduces urge to flee
  return 0.1 + p.neuroticism * 0.7 - p.agreeableness * 0.4;
}

// Cursor play — laser-pointer-chase drive.

function scoreChaseCursor(p: PersonalityComponent): number {
  // E (extraversion) + O (openness) → cat-and-laser-pointer chase instinct;
  // N (neuroticism) → suppresses the impulse. Base + weights are intentionally
  // high so playful cursor movement reliably wins for extraverted pets.
  return 0.4 + p.extraversion * 0.9 + p.openness * 0.5 - p.neuroticism * 0.5;
}

function scorePlayRomp(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E → play energy, O → novelty-seeking, N → inhibition. Playful pets should
  // regularly choose a sustained romp over a single one-shot jump.
  const base = 0.05 + p.extraversion * 0.55 + p.openness * 0.35 - p.neuroticism * 0.35;
  if (!drives) return base;
  // A tired pet has no romps left in it.
  return base - driveResponseCurve(1 - drives.energy) * driveWeight(0.7, restSensitivity(p));
}

// ── Expressive idle pose score functions ───────────────────────────────────
// Each pose leans on the personality axes that best explain the gesture, with
// modest bases so they punctuate — rather than dominate — the wander/rest pool.

function scoreGreet(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E + A → warmth toward whoever is near; N → shyness.
  const base = 0.15 + p.extraversion * 0.6 + p.agreeableness * 0.4 - p.neuroticism * 0.3;
  if (!drives) return base;
  // A lonely pet is a little keener to say hello.
  return base + driveResponseCurve(drives.social) * driveWeight(0.3, socialSensitivity(p));
}

function scoreGroom(p: PersonalityComponent): number {
  // C → tidy self-maintenance; low E → the calm homebody settles into it.
  return 0.15 + p.conscientiousness * 0.5 + (1 - p.extraversion) * 0.25;
}

function scoreObserve(p: PersonalityComponent, drives?: DrivesComponent): number {
  // O → curiosity; slight introvert lean (extraverts would rather approach).
  const base = 0.15 + p.openness * 0.6 - p.extraversion * 0.1;
  if (!drives) return base;
  // Boredom (unmet curiosity) makes examining the surroundings appealing.
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.4, curiositySensitivity(p));
}

function scoreBeckon(p: PersonalityComponent, drives?: DrivesComponent): number {
  // A + E → wanting the user's company; N → hesitance.
  const base = 0.1 + p.extraversion * 0.3 + p.agreeableness * 0.3 - p.neuroticism * 0.2;
  if (!drives) return base;
  // Loneliness is the strongest pull toward an expectant "come here".
  return base + driveResponseCurve(drives.social) * driveWeight(0.5, socialSensitivity(p));
}

function scoreFret(p: PersonalityComponent): number {
  // N → anxious sulking; E → shrugs it off. Low base keeps it occasional.
  return 0.05 + p.neuroticism * 0.55 - p.extraversion * 0.2;
}

function scoreNap(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + (1 - p.extraversion) * 0.2;
  if (!drives) return base;
  return base + driveResponseCurve(1 - drives.energy) * driveWeight(0.45, restSensitivity(p));
}

function scoreMeditate(p: PersonalityComponent): number {
  return 0.05 + p.conscientiousness * 0.12 + (1 - p.neuroticism) * 0.15;
}

function scorePlayFeint(p: PersonalityComponent): number {
  return 0.05 + p.extraversion * 0.3 + p.openness * 0.2 + (1 - p.conscientiousness) * 0.15;
}

function scoreKeepWatch(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.agreeableness * 0.25 + p.conscientiousness * 0.15;
  if (!drives) return base;
  return base + driveResponseCurve(drives.social) * driveWeight(0.25, socialSensitivity(p));
}

function scorePeek(p: PersonalityComponent): number {
  return 0.05 + (1 - p.extraversion) * 0.2 + p.openness * 0.15;
}

function scoreWithdraw(p: PersonalityComponent): number {
  return 0.05 + (1 - p.agreeableness) * 0.25 + (1 - p.extraversion) * 0.15;
}

function scoreInspect(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.openness * 0.3 + (1 - p.extraversion) * 0.08;
  if (!drives) return base;
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.35, curiositySensitivity(p));
}

function scoreFollowRoutine(p: PersonalityComponent): number {
  return 0.05 + p.conscientiousness * 0.35 + (1 - p.neuroticism) * 0.1;
}

function scoreStrut(p: PersonalityComponent): number {
  return 0.05 + p.extraversion * 0.25 + (1 - p.neuroticism) * 0.2;
}

function scoreOfferComfort(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.agreeableness * 0.35 + p.extraversion * 0.08;
  if (!drives) return base;
  return base + driveResponseCurve(drives.social) * driveWeight(0.2, socialSensitivity(p));
}

function scoreStandLookout(p: PersonalityComponent): number {
  return 0.05 + p.neuroticism * 0.4 + (1 - p.extraversion) * 0.08;
}

// ── Second signature pose score functions ──────────────────────────────────
// A second catalog-exclusive beat per personality. Bases mirror the first
// signature's tier so the two poses alternate rather than one crowding out the
// other; each still leans on the axes that best explain the gesture.

function scoreCaper(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.extraversion * 0.3 + p.openness * 0.2 - p.neuroticism * 0.15;
  if (!drives) return base;
  // A rested, playful pet has energy to burn on a caper.
  return base + driveResponseCurve(drives.energy) * driveWeight(0.2, restSensitivity(p));
}

function scoreCheckIn(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.agreeableness * 0.3 + p.conscientiousness * 0.15;
  if (!drives) return base;
  return base + driveResponseCurve(drives.social) * driveWeight(0.25, socialSensitivity(p));
}

function scoreHideAway(p: PersonalityComponent): number {
  return 0.05 + (1 - p.extraversion) * 0.3 + p.neuroticism * 0.1;
}

function scoreExploreNook(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.openness * 0.3 + (1 - p.extraversion) * 0.08;
  if (!drives) return base;
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.35, curiositySensitivity(p));
}

function scoreTidyUp(p: PersonalityComponent): number {
  return 0.05 + p.conscientiousness * 0.35 + (1 - p.neuroticism) * 0.08;
}

function scorePosture(p: PersonalityComponent): number {
  return 0.05 + p.extraversion * 0.3 + (1 - p.neuroticism) * 0.15;
}

function scoreNurture(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.agreeableness * 0.35 + p.extraversion * 0.1;
  if (!drives) return base;
  return base + driveResponseCurve(drives.social) * driveWeight(0.2, socialSensitivity(p));
}

function scoreScheme(p: PersonalityComponent): number {
  return 0.05 + p.extraversion * 0.25 + p.openness * 0.2 + (1 - p.conscientiousness) * 0.15;
}

function scoreLounge(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + (1 - p.extraversion) * 0.2 + (1 - p.conscientiousness) * 0.1;
  if (!drives) return base;
  return base + driveResponseCurve(1 - drives.energy) * driveWeight(0.4, restSensitivity(p));
}

function scoreCenter(p: PersonalityComponent): number {
  return 0.05 + p.conscientiousness * 0.15 + (1 - p.neuroticism) * 0.2;
}

function scorePreen(p: PersonalityComponent): number {
  return 0.05 + (1 - p.agreeableness) * 0.25 + (1 - p.extraversion) * 0.12;
}

function scoreStartleScan(p: PersonalityComponent): number {
  return 0.05 + p.neuroticism * 0.4 + (1 - p.extraversion) * 0.1;
}

function scoreAppraise(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.openness * 0.25 + p.conscientiousness * 0.2 - p.extraversion * 0.08;
  if (!drives) return base;
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.3, curiositySensitivity(p));
}

/**
 * Each catalog personality's second signature pose, keyed by catalog id. The
 * decision system offers exactly this pose (in addition to the personality's
 * first signature) whenever the pet is a grounded walker, so every preset shows
 * two distinct catalog-exclusive silhouettes across its autonomous life.
 */
const SECOND_SIGNATURE_POSE: Partial<
  Record<
    string,
    {
      kind: ExpressivePoseKind;
      score: (p: PersonalityComponent, drives?: DrivesComponent) => number;
    }
  >
> = {
  playful: { kind: "caper", score: scoreCaper },
  attentive: { kind: "check-in", score: scoreCheckIn },
  reserved: { kind: "hide-away", score: scoreHideAway },
  curious: { kind: "explore-nook", score: scoreExploreNook },
  steady: { kind: "tidy-up", score: scoreTidyUp },
  feisty: { kind: "posture", score: scorePosture },
  gentle: { kind: "nurture", score: scoreNurture },
  mischievous: { kind: "scheme", score: scoreScheme },
  lazy: { kind: "lounge", score: scoreLounge },
  zen: { kind: "center", score: scoreCenter },
  aloof: { kind: "preen", score: scorePreen },
  skittish: { kind: "startle-scan", score: scoreStartleScan },
  shrewd: { kind: "appraise", score: scoreAppraise },
};

/**
 * Personality-modulated wander radii.
 * "near": high N → tighter range but still meaningfully visible movement.
 *         Previous range [60..140 → 80..80] left high-N pets making
 *         imperceptible "wanders" of 80 px in a fixed direction. The new
 *         range guarantees a window of at least 40 px even at N=1.
 * "far":  high O → wider exploration range.
 * Exported for unit testing.
 */
export function wanderRadius(
  p: PersonalityComponent,
  range: "near" | "far",
  bodyWidth = DEFAULT_WANDER_BODY_WIDTH,
): [number, number] {
  const base = bodyWidth * WANDER_BASE_BODY_MULTIPLIER;
  if (range === "near") {
    return [
      base + p.neuroticism * bodyWidth * 1.25,
      base * 2.25 - p.neuroticism * bodyWidth * 1.25,
    ];
  } else {
    return [base * 2 + p.openness * base, base * 4 + p.openness * base * 2];
  }
}

function pickWanderPosition(
  petX: number,
  petY: number,
  bounds: { x?: number; y?: number; width: number; height: number },
  random: RandomSource,
  range: "near" | "far",
  personality?: PersonalityComponent,
  bodyWidth = DEFAULT_WANDER_BODY_WIDTH,
): { x: number; y: number } {
  const margin = 48;
  // A wide body cannot centre itself within half its width of a side wall, so a
  // target inside that band is physically unreachable: the walker jams against
  // the wall, never satisfies the horizontal arrival test, never returns to
  // "idle", and so never gets to re-decide (e.g. to jump). Widen the horizontal
  // margin to at least the body's half-width so targets stay reachable. The
  // default 32-wide body's half-width (16) stays under `margin`, so this leaves
  // default-sized pets unchanged.
  const horizontalMargin = Math.max(margin, bodyWidth / 2);
  const minX = (bounds.x ?? 0) + horizontalMargin;
  const minY = (bounds.y ?? 0) + margin;
  const maxX = (bounds.x ?? 0) + bounds.width - horizontalMargin;
  const maxY = (bounds.y ?? 0) + bounds.height - margin;
  const angle = random.next() * Math.PI * 2;
  const [minR, maxR] = personality
    ? wanderRadius(personality, range, bodyWidth)
    : range === "near"
      ? [60, 140]
      : [200, 400];
  const radius = minR + random.next() * (maxR - minR);
  return {
    x: clamp(petX + Math.cos(angle) * radius, minX, maxX),
    y: clamp(petY + Math.sin(angle) * radius, minY, maxY),
  };
}

function setPetSteering(components: ComponentStore, id: string, mode: SteeringMode): void {
  components.setComponent(id, { type: "Steering", mode });
}

function isNearUserAnchor(
  userAnchor: { x: number; y: number } | null,
  petX: number,
  petY: number,
  isFlying: boolean,
): boolean {
  if (!userAnchor) return false;
  const dx = userAnchor.x - petX;
  const dy = userAnchor.y - petY;
  const distance = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
  return distance <= USER_PROXIMITY_RADIUS;
}

// ── BehaviorDecisionSystem (priority 4: autonomous) ──────────────────────
//
// Trigger: no active claim AND intent === "idle" AND no motion target.
// Scores all candidates using OCEAN Personality weights, then samples a winner
// via softmax (temperature scales with neuroticism: high N → flatter distribution).
// Emits a BehaviorDecisionToken and claims the entity with source="autonomous".
// Does NOT mutate MotionTarget / Steering / JumpActionState / ClimbIntentState —
// that is the responsibility of BehaviorPlanningSystem.

export function runBehaviorDecisionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  // One pet per climbable surface at a time.  Pre-populate from entities that
  // are already approaching or actively climbing.  Updated on winner selection so
  // sequential entity passes in the same step also see fresh reservations.
  const claimedSurfaces = new Set<string>();
  components.forEach(["ClimbIntentState"], (otherId, [otherIntent]) => {
    if (otherIntent.phase === "approaching") {
      claimedSurfaces.add(otherIntent.surfaceEntityId);
      return;
    }
    if (otherIntent.phase === "attached" && components.getComponent(otherId, "ClimbingTag")) {
      claimedSurfaces.add(otherIntent.surfaceEntityId);
    }
  });

  components.forEach(
    ["Steering", "MotionTarget", "Transform", "Personality"],
    (id, [intent, motion, transform, personality]) => {
      // Trigger conditions — only fire for pets that have no active goal.
      // "active" = pursuing a wander/climb target  "seek" = pursuing user
      // Both set a motion target; arrival resets intent back to "idle".
      // "idle" is the only state that means "ready for a new decision".
      if (intent.mode !== "stand") return;
      if (motion.targetPosition !== null) return;
      if (motion.targetEntityId !== null) return;

      // Block if any active claim exists (same- and higher-priority guard).
      const existingClaim = components.getComponent(id, "BehaviorDecisionState");
      if (existingClaim && existingClaim.expiresAt > now) return;

      // Skip only while the pet is actually held (a freezing task the user
      // has not released). A released pet keeps its reported status but is
      // free to make autonomous decisions again.
      if (components.getComponent(id, "TaskMovementHold")) return;

      // If the pet is already committed to approaching a climb surface, don't
      // emit a new autonomous decision — that would change intent and allow
      // MotionTargetSystem (seek) to overwrite ClimbApproachSystem's target.
      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (climbIntent?.phase === "approaching") return;

      const petX = transform.position.x;
      const petY = transform.position.y;
      // Optional — undefined for pets built before this feature. Every
      // drives-aware score function below falls back to its original
      // personality-only formula when this is undefined.
      const drives = components.getComponent(id, "Drives");
      const mood = components.getComponent(id, "MoodState");

      // Phase 4: PendingReaction present → claim just expired at reactsAt.
      // Route to the personality-shaped reactive candidate pool instead of
      // the normal autonomous pool.
      const pendingReaction = components.getComponent(id, "PendingReaction");
      if (pendingReaction) {
        const otherPos = pendingReaction.context.otherPosition ?? {
          x: petX + 100,
          y: petY,
        };
        const away = normalize({ x: petX - otherPos.x, y: petY - otherPos.y });
        const movementAway = constrainCollisionDirectionForLocomotion(
          components,
          id,
          pendingReaction.context.otherEntityId,
          away,
        );
        const side = isHorizontalOnlyCollisionResponse(components, id)
          ? movementAway
          : { x: -away.y, y: away.x };
        const reactionDistance = petWidth(components, id) * COLLISION_REACTION_WIDTH_MULTIPLIER;
        const engageStopDistance = petWidth(components, id) * PET_ENGAGE_STOP_WIDTH_MULTIPLIER;
        const stillOverlapping = isPendingReactionStillOverlapping(components, id, pendingReaction);
        const canCollisionJump =
          stillOverlapping &&
          !!components.getComponent(id, "CanJump") &&
          !components.getComponent(id, "JumpActionState") &&
          !!components.getComponent(id, "WalkingTag") &&
          !components.getComponent(id, "FlyingTag") &&
          !components.getComponent(id, "ClimbingTag") &&
          (components.getComponent(id, "ContactState")?.grounded ?? true);

        const fleeTarget = {
          x: clampToBoundsX(
            petX + movementAway.x * reactionDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: clampToBoundsY(
            petY + movementAway.y * reactionDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
        };
        // engageTarget sits 80 px from the other pet on SELF's side — close
        // enough to "engage" but not so close that the pet walks straight
        // through. `away` points from other to self, so adding (not subtracting)
        // it to otherPos keeps the target between the two pets. The earlier
        // `otherPos - away * D` placed the target on the FAR side, causing pets
        // to walk through each other and immediately re-collide (cluster bug).
        const engageTarget = {
          x: clampToBoundsX(
            otherPos.x + movementAway.x * engageStopDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: clampToBoundsY(
            otherPos.y + movementAway.y * engageStopDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
        };
        const avoidTarget = {
          x: clampToBoundsX(petX + side.x * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
          y: clampToBoundsY(petY + side.y * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
        };
        // B4: for a socializable pair the bump-to-greet conversion (in
        // SocialInteractionSystem, earlier this tick) supersedes the engage
        // reaction — reaching this point means the pet rolled against
        // inviting, so "walk close and stop" would be a mixed signal. Engage
        // stays available toward non-socializable entities.
        const bumpOtherId = pendingReaction.context.otherEntityId;
        const bumpSupersedesEngage =
          !!bumpOtherId && isBumpSocialEligible(components, id, bumpOtherId, now);
        const reactiveCandidates: Candidate[] = [
          {
            kind: "collision-flee",
            score: scoreCollisionFlee(personality),
            build: () => ({ targetPosition: fleeTarget }),
          },
          ...(bumpSupersedesEngage
            ? []
            : [
                {
                  kind: "collision-engage" as const,
                  score: scoreCollisionEngage(personality),
                  build: () => ({ targetPosition: engageTarget }),
                },
              ]),
          {
            kind: "collision-avoid",
            score: scoreCollisionAvoid(),
            build: () => ({ targetPosition: avoidTarget }),
          },
        ];
        if (canCollisionJump) {
          reactiveCandidates.push({
            kind: "collision-jump",
            score: scoreCollisionJump(personality),
            build: () => ({ targetPosition: fleeTarget }),
          });
        }
        if (!stillOverlapping) {
          reactiveCandidates.push({
            kind: "collision-stay",
            score: scoreCollisionStay(personality),
            build: () => ({}),
          });
        }
        reactiveCandidates.push({
          kind: "collision-unfazed",
          score: scoreCollisionUnfazed(personality),
          // unfazedTarget is computed lazily in build() so random is consumed
          // only if this candidate wins, keeping the softmax r-draw stable.
          //
          // NOTE: plan specified "re-emit previous goal" (copy MotionTarget before
          // collision disrupted it). Current implementation picks a fresh wander-near
          // position instead — intentional simplification. The visual result is similar
          // ("stays nearby") but the pet doesn't resume its original trajectory.
          // Restore-previous-goal semantics deferred to Phase 6 visual review.
          build: () => ({
            targetPosition: pickWanderPosition(
              petX,
              petY,
              bounds,
              random,
              "near",
              personality,
              petWidth(components, id),
            ),
          }),
        });

        const reactionSelection = softmaxSample(
          reactiveCandidates.map((candidate) => ({
            ...candidate,
            score: moodAdjustedDecisionScore(
              candidate.kind,
              signedDecisionScore(personality.catalogId, candidate.kind, candidate.score),
              mood,
            ),
          })),
          personality.neuroticism,
          random,
        );
        const reactionWinner = reactionSelection.winner;
        components.setComponent(id, {
          type: "BehaviorDecisionToken",
          kind: reactionWinner.kind,
          decidedAt: now,
          consumed: false,
          selectionTrace: reactionSelection.trace,
          ...reactionWinner.build(),
        });
        claim(components, id, "autonomous", now, reactionWinner.kind);
        components.removeComponent(id, "PendingReaction");
        return;
      }

      // Read world context from this pet's Perception snapshot.
      const perception = components.getComponent(id, "Perception");
      const perceptionAnchor = perception?.userAnchor;
      const userAnchor: { id: string; x: number; y: number } | null = perceptionAnchor
        ? {
            id: perceptionAnchor.id,
            x: perceptionAnchor.position.x,
            y: perceptionAnchor.position.y,
          }
        : null;

      const isFlying = !!components.getComponent(id, "FlyingTag");

      const candidates: Candidate[] = [];

      pushCandidate(candidates, components, id, now, {
        kind: "wander-near",
        score: scoreWanderNear(personality),
        build: () => ({
          targetPosition: pickWanderPosition(
            petX,
            petY,
            bounds,
            random,
            "near",
            personality,
            petWidth(components, id),
          ),
        }),
      });

      pushCandidate(candidates, components, id, now, {
        kind: "wander-far",
        score: scoreWanderFar(personality, drives),
        build: () => ({
          targetPosition: pickWanderPosition(
            petX,
            petY,
            bounds,
            random,
            "far",
            personality,
            petWidth(components, id),
          ),
        }),
      });

      if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "seek-user",
          score: scoreSeekUser(personality, drives),
          // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
          // seek positioning; Planning only needs to promote intent to "seek".
          build: () => ({}),
        });
      }

      // Cursor play — a fast/darting cursor near this pet offers chase-cursor,
      // independent of the seek-user proximity gate above (playful chasing can
      // happen right next to the user, unlike the "come say hi" seek-user drive).
      if (userAnchor && perception?.cursor?.isPlayful) {
        pushCandidate(candidates, components, id, now, {
          kind: "chase-cursor",
          score: scoreChaseCursor(personality),
          build: () => ({
            targetEntityId: userAnchor.id,
            targetPosition: { x: userAnchor.x, y: userAnchor.y },
          }),
        });
      }

      const canJump = components.getComponent(id, "CanJump");
      const jumpState = components.getComponent(id, "JumpActionState");
      const contact = components.getComponent(id, "ContactState");
      if (canJump && !jumpState && (!contact || contact.grounded)) {
        pushCandidate(candidates, components, id, now, {
          kind: "request-jump",
          score: scoreJump(personality, drives),
          // Jump is a one-shot action; Planning reads JumpActionState directly.
          build: () => ({}),
        });
      }

      // Sustained solo play: a grounded walker can string hops and dashes
      // together for several seconds (RompProgressSystem choreographs it).
      const isGroundedWalker =
        !!components.getComponent(id, "WalkingTag") &&
        !isFlying &&
        !components.getComponent(id, "ClimbingTag") &&
        (!contact || contact.grounded);
      if (canJump && !jumpState && isGroundedWalker && personality.catalogId === "playful") {
        pushCandidate(candidates, components, id, now, {
          kind: "play-romp",
          score: scorePlayRomp(personality, drives),
          build: () => ({
            activityDurationMs: Math.round(ROMP_BASE_MS + random.next() * ROMP_EXTRA_MS),
          }),
        });
      }

      const canClimb = components.getComponent(id, "CanWallClimb");
      const climbing = components.getComponent(id, "ClimbingTag");
      const climbDismount = components.getComponent(id, "ClimbDismountState");
      if (canClimb && !climbing && (!climbDismount || climbDismount.phase === "ready")) {
        // Nearest climbable surface from Perception; skip if already reserved.
        const nearestClimbable = perception?.nearbyClimbables[0];
        const surface =
          nearestClimbable && !claimedSurfaces.has(nearestClimbable.id)
            ? {
                id: nearestClimbable.id,
                x: nearestClimbable.position.x,
                y: nearestClimbable.position.y,
              }
            : null;
        if (surface) {
          pushCandidate(candidates, components, id, now, {
            kind: "request-climb",
            score: scoreClimb(personality, drives),
            build: () => {
              // Reserve the surface so later entities in this same pass won't
              // double-target it (build() runs before the next entity is processed).
              claimedSurfaces.add(surface.id);
              return {
                climbSurfaceId: surface.id,
                climbTargetY: surface.y - 80,
              };
            },
          });
        }
      }

      // Phase 3: social candidates — only when another pet is within perception range.
      const nearbyPets = perception?.nearbyPets ?? [];
      if (nearbyPets.length > 0) {
        const nearestPet = nearbyPets[0];
        pushCandidate(candidates, components, id, now, {
          kind: "approach-pet",
          score: scoreApproachPet(personality, drives),
          // Keep the entity id so MotionTargetSystem can track the moving pet
          // until a collision reaction interrupts the approach.
          build: () => ({
            targetEntityId: nearestPet.id,
            targetPosition: { ...nearestPet.position },
          }),
        });

        const fleeDirX = petX - nearestPet.position.x;
        const fleeDirY = petY - nearestPet.position.y;
        const fleeLen = Math.hypot(fleeDirX, fleeDirY) || 1;
        const fleeDistance = petWidth(components, id) * PET_FLEE_WIDTH_MULTIPLIER;
        const fleePos = {
          x: clampToBoundsX(
            petX + (fleeDirX / fleeLen) * fleeDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: clampToBoundsY(
            petY + (fleeDirY / fleeLen) * fleeDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
        };
        pushCandidate(candidates, components, id, now, {
          kind: "flee-from-pet",
          score: scoreFleeFromPet(personality),
          build: () => ({ targetPosition: fleePos }),
        });
      }

      // Expressive idle poses — sustained, stationary gestures that light up
      // the otherwise agent-only sprite rows. Each is gated to the context that
      // makes it read, then materialized as a claim held for its whole
      // duration. Greeting waves at the user when they are near (pet-to-pet
      // hellos are already served by approach-pet); beckoning calls the user
      // over when they are far. Catalog-exclusive poses are gated by both
      // user distance and catalog id so their silhouettes do not leak into
      // neighboring personalities.
      if (userAnchor && isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "greet",
          score: scoreGreet(personality, drives),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("greet", random) }),
        });
        if (isGroundedWalker && personality.catalogId === "mischievous") {
          pushCandidate(candidates, components, id, now, {
            kind: "play-feint",
            score: scorePlayFeint(personality),
            build: () => ({
              targetEntityId: userAnchor.id,
              targetPosition: { x: userAnchor.x, y: userAnchor.y },
              activityDurationMs: Math.round(FEINT_BASE_MS + random.next() * FEINT_EXTRA_MS),
            }),
          });
        }
        if (isGroundedWalker && personality.catalogId === "attentive") {
          pushCandidate(candidates, components, id, now, {
            kind: "keep-watch",
            score: scoreKeepWatch(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("keep-watch", random),
            }),
          });
        }
        if (isGroundedWalker && personality.catalogId === "gentle") {
          pushCandidate(candidates, components, id, now, {
            kind: "offer-comfort",
            score: scoreOfferComfort(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("offer-comfort", random),
            }),
          });
        }
        if (isGroundedWalker && personality.catalogId === "aloof") {
          const direction =
            petX === userAnchor.x ? (random.next() < 0.5 ? -1 : 1) : Math.sign(petX - userAnchor.x);
          const targetPosition = {
            x: clampToBoundsX(
              petX + direction * petWidth(components, id) * WITHDRAW_BODY_WIDTHS,
              bounds,
              COLLISION_TARGET_MARGIN,
            ),
            y: petY,
          };
          pushCandidate(candidates, components, id, now, {
            kind: "withdraw",
            score: scoreWithdraw(personality),
            build: () => ({
              targetPosition,
              activityDurationMs: WITHDRAW_DURATION_MS,
            }),
          });
        }
      }

      if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "beckon",
          score: scoreBeckon(personality, drives),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("beckon", random) }),
        });
        if (isGroundedWalker && personality.catalogId === "reserved") {
          pushCandidate(candidates, components, id, now, {
            kind: "peek",
            score: scorePeek(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("peek", random),
            }),
          });
        }
      }

      if (isGroundedWalker) {
        if (personality.catalogId === "curious") {
          pushCandidate(candidates, components, id, now, {
            kind: "inspect",
            score: scoreInspect(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("inspect", random),
            }),
          });
        }
        if (personality.catalogId === "steady") {
          pushCandidate(candidates, components, id, now, {
            kind: "follow-routine",
            score: scoreFollowRoutine(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("follow-routine", random),
            }),
          });
        }
        if (personality.catalogId === "feisty") {
          const direction = random.next() < 0.5 ? -1 : 1;
          const distance = petWidth(components, id) * STRUT_BODY_WIDTHS;
          const preferredX = clampToBoundsX(
            petX + direction * distance,
            bounds,
            COLLISION_TARGET_MARGIN,
          );
          const alternateX = clampToBoundsX(
            petX - direction * distance,
            bounds,
            COLLISION_TARGET_MARGIN,
          );
          const targetX =
            Math.abs(preferredX - petX) >= Math.abs(alternateX - petX) ? preferredX : alternateX;
          pushCandidate(candidates, components, id, now, {
            kind: "strut",
            score: scoreStrut(personality),
            build: () => ({
              targetPosition: {
                x: targetX,
                y: petY,
              },
              activityDurationMs: STRUT_DURATION_MS,
            }),
          });
        }
        if (personality.catalogId === "skittish") {
          pushCandidate(candidates, components, id, now, {
            kind: "stand-lookout",
            score: scoreStandLookout(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("stand-lookout", random),
            }),
          });
        }
        pushCandidate(candidates, components, id, now, {
          kind: "groom",
          score: scoreGroom(personality),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("groom", random) }),
        });
        pushCandidate(candidates, components, id, now, {
          kind: "observe",
          score: scoreObserve(personality, drives),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("observe", random) }),
        });
        pushCandidate(candidates, components, id, now, {
          kind: "fret",
          score: scoreFret(personality),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("fret", random) }),
        });
        if (personality.catalogId === "lazy") {
          pushCandidate(candidates, components, id, now, {
            kind: "nap",
            score: scoreNap(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("nap", random),
            }),
          });
        }
        if (personality.catalogId === "zen") {
          pushCandidate(candidates, components, id, now, {
            kind: "meditate",
            score: scoreMeditate(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("meditate", random),
            }),
          });
        }

        // Second signature pose per personality — a catalog-exclusive stationary
        // beat that stands alongside each preset's first signature. All hold a
        // still pose, so they share the expressive materialization path; only
        // the choreography, cue, and gating differ.
        const secondSignature = SECOND_SIGNATURE_POSE[personality.catalogId ?? ""];
        if (secondSignature) {
          pushCandidate(candidates, components, id, now, {
            kind: secondSignature.kind,
            score: secondSignature.score(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs(secondSignature.kind, random),
            }),
          });
        }
      }

      pushCandidate(candidates, components, id, now, {
        kind: "idle-stay",
        score: scoreIdleStay(personality, drives),
        build: () => ({}),
      });

      if (candidates.length === 0) return;
      // Softmax sampling: temperature scales with neuroticism.
      // High N → higher T → flatter distribution → more erratic behaviour.
      const selection = softmaxSample(
        candidates.map((candidate) => ({
          ...candidate,
          score: moodAdjustedDecisionScore(
            candidate.kind,
            signedDecisionScore(personality.catalogId, candidate.kind, candidate.score),
            mood,
          ),
        })),
        personality.neuroticism,
        random,
      );
      const winner = selection.winner;
      const tokenFields = winner.build();
      components.setComponent(id, {
        type: "BehaviorDecisionToken",
        kind: winner.kind,
        decidedAt: now,
        consumed: false,
        selectionTrace: selection.trace,
        ...tokenFields,
      });
      // Sustained activities hold their claim for their whole duration:
      // idle-stay becomes a genuine, personality-length rest instead of a
      // 500 ms pause before the next re-roll, and play-romp keeps its claim
      // while RompProgressSystem choreographs the hops.
      const activityExpiresAt =
        winner.kind === "idle-stay"
          ? now + idleStayDurationMs(personality, random)
          : tokenFields.activityDurationMs !== undefined
            ? now + tokenFields.activityDurationMs
            : undefined;
      claim(components, id, "autonomous", now, winner.kind, activityExpiresAt);
    },
  );
}

// ── BehaviorPlanningSystem ────────────────────────────────────────────────
//
// Runs at end of BEHAVIOR phase, after BehaviorDecisionSystem.
// Reads the unconsumed BehaviorDecisionToken and materializes it into
// concrete state components (MotionTarget, Steering, JumpActionState,
// ClimbIntentState). Marks the token consumed when done.

export function runBehaviorPlanningSystem(components: ComponentStore, _clock: Clock): void {
  components.forEach(["BehaviorDecisionToken"], (id, [token]) => {
    if (token.consumed) return;
    switch (token.kind) {
      case "wander-near":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      case "wander-far":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        // Venturing far resolves some of the pet's need for novelty.
        adjustDrive(components, id, {
          curiosity: -WANDER_FAR_CURIOSITY_RELIEF,
        });
        break;
      case "seek-user":
        // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
        // all seek positioning. Planning only promotes the intent.
        setPetSteering(components, id, "arrive");
        break;
      case "request-jump": {
        const jumpState = components.getComponent(id, "JumpActionState");
        if (!jumpState) {
          components.setComponent(id, {
            type: "JumpActionState",
            phase: "requested",
            cooldownMs: 0,
          });
        }
        // Jump has no arrival event, so intent stays "idle".
        adjustDrive(components, id, { energy: -JUMP_ENERGY_COST });
        break;
      }
      case "request-climb":
        // Both climb fields are set together by the decision system; guard so a
        // malformed token skips materialization rather than climbing to nowhere.
        if (token.climbSurfaceId != null && token.climbTargetY != null) {
          components.setComponent(id, {
            type: "ClimbIntentState",
            phase: "approaching",
            surfaceEntityId: token.climbSurfaceId,
            targetY: token.climbTargetY,
            startedAt: token.decidedAt,
          });
          setPetSteering(components, id, "pursue");
          // Climbing costs energy and resolves curiosity, same as wander-far.
          adjustDrive(components, id, {
            energy: -CLIMB_ENERGY_COST,
            curiosity: -CLIMB_CURIOSITY_RELIEF,
          });
        }
        break;
      case "idle-stay":
        // Intentional no-op: intent stays idle, target stays null.
        break;
      case "play-romp": {
        const durationMs = token.activityDurationMs ?? ROMP_BASE_MS;
        components.setComponent(id, {
          type: "RompState",
          startedAt: token.decidedAt,
          endsAt: token.decidedAt + durationMs,
          // First hop fires on the next RompProgressSystem pass.
          nextHopAt: token.decidedAt,
        });
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "romp",
          mood: "excited",
          emote: "sparkle",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + ROMP_END_CUE_MS,
        });
        break;
      }
      case "play-feint": {
        const durationMs = token.activityDurationMs ?? FEINT_BASE_MS;
        if (token.targetEntityId != null) {
          components.setComponent(id, {
            type: "FeintState",
            phase: "approach",
            targetEntityId: token.targetEntityId,
            startedAt: token.decidedAt,
            turnsAt: token.decidedAt + FEINT_APPROACH_MS,
            endsAt: token.decidedAt + durationMs,
          });
        }
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: token.targetEntityId ?? null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "signature",
          mood: "thinking",
          emote: "question",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + FEINT_APPROACH_MS,
        });
        break;
      }
      case "withdraw": {
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "signature",
          mood: "thinking",
          emote: "none",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + (token.activityDurationMs ?? WITHDRAW_DURATION_MS),
        });
        break;
      }
      case "strut": {
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
          speedFactor: STRUT_SPEED_FACTOR,
        });
        setPetSteering(components, id, "pursue");
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "signature",
          mood: "excited",
          emote: "sparkle",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + STRUT_DURATION_MS,
        });
        adjustDrive(components, id, { energy: -0.05 });
        break;
      }
      // Expressive idle poses — stand still and hold a gesture. No motion; the
      // sustained autonomous claim (set in the decision) drives the sprite row.
      // The mood/emote cue and any drive relief run here.
      case "greet":
      case "groom":
      case "observe":
      case "beckon":
      case "fret":
      case "nap":
      case "meditate":
      case "keep-watch":
      case "peek":
      case "inspect":
      case "follow-routine":
      case "offer-comfort":
      case "stand-lookout":
      // Second signature poses share the stationary materialization path.
      case "caper":
      case "check-in":
      case "hide-away":
      case "explore-nook":
      case "tidy-up":
      case "posture":
      case "nurture":
      case "scheme":
      case "lounge":
      case "center":
      case "preen":
      case "startle-scan":
      case "appraise": {
        setPetSteering(components, id, "stand");
        clearMotionTarget(components, id);
        const cue = EXPRESSIVE_POSE_CUES[token.kind];
        const durationMs = token.activityDurationMs ?? EXPRESSIVE_POSE_DURATIONS[token.kind].base;
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "expressive",
          mood: cue.mood,
          emote: cue.emote,
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + durationMs,
        });
        if (token.kind === "greet") {
          // A hello meets a little of the need for company.
          adjustDrive(components, id, { social: -0.15 });
        } else if (token.kind === "groom") {
          // A calm tidy-up is mildly restful.
          adjustDrive(components, id, { energy: 0.1 });
        } else if (token.kind === "observe") {
          // Examining the surroundings scratches the novelty itch.
          adjustDrive(components, id, { curiosity: -0.3 });
        } else if (token.kind === "nap") {
          adjustDrive(components, id, { energy: 0.3 });
          recordPetExperience(components, id, "rested", token.decidedAt);
        } else if (token.kind === "meditate") {
          adjustDrive(components, id, { energy: 0.1 });
          recordPetExperience(components, id, "self-soothed", token.decidedAt);
        } else if (token.kind === "keep-watch") {
          adjustDrive(components, id, { social: -0.2 });
        } else if (token.kind === "peek") {
          adjustDrive(components, id, { curiosity: -0.15 });
        } else if (token.kind === "inspect") {
          adjustDrive(components, id, { curiosity: -0.35 });
        } else if (token.kind === "follow-routine") {
          adjustDrive(components, id, { energy: 0.08 });
        } else if (token.kind === "offer-comfort") {
          adjustDrive(components, id, { social: -0.2 });
        } else if (token.kind === "caper") {
          // Bouncing about burns a little energy but scratches the play itch.
          adjustDrive(components, id, { energy: -0.05 });
        } else if (token.kind === "check-in") {
          adjustDrive(components, id, { social: -0.15 });
        } else if (token.kind === "hide-away") {
          adjustDrive(components, id, { curiosity: -0.1 });
        } else if (token.kind === "explore-nook") {
          adjustDrive(components, id, { curiosity: -0.3 });
        } else if (token.kind === "tidy-up") {
          adjustDrive(components, id, { energy: 0.08 });
        } else if (token.kind === "posture") {
          adjustDrive(components, id, { energy: -0.05 });
        } else if (token.kind === "nurture") {
          adjustDrive(components, id, { social: -0.2 });
        } else if (token.kind === "scheme") {
          adjustDrive(components, id, { curiosity: -0.1 });
        } else if (token.kind === "lounge") {
          adjustDrive(components, id, { energy: 0.2 });
        } else if (token.kind === "center") {
          adjustDrive(components, id, { energy: 0.1 });
        } else if (token.kind === "preen") {
          adjustDrive(components, id, { energy: 0.05 });
        } else if (token.kind === "appraise") {
          adjustDrive(components, id, { curiosity: -0.2 });
        }
        break;
      }
      // Phase 3 — social movements.
      case "approach-pet":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: token.targetEntityId ?? null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      case "flee-from-pet":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      // Cursor play — chase the user-anchor entity, which now tracks the
      // live cursor position (see CursorInputSystem).
      case "chase-cursor":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: token.targetEntityId ?? null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      // Phase 4 — collision reactions (position pre-computed in Decision)
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough into the shared collision-reaction materialization below.
      case "collision-engage":
        // Engaging with the other pet is a partial, friendlier social fix
        // than a full approach-pet-success catch.
        adjustDrive(components, id, {
          social: -COLLISION_ENGAGE_SOCIAL_REFILL,
        });
      case "collision-flee":
      case "collision-avoid":
      case "collision-jump":
      case "collision-stay":
      case "collision-unfazed":
        if (token.kind === "collision-jump" && !components.getComponent(id, "JumpActionState")) {
          components.setComponent(id, {
            type: "JumpActionState",
            phase: "requested",
            cooldownMs: 0,
          });
        }
        if (token.targetPosition) {
          components.setComponent(id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: token.targetPosition,
          });
          setPetSteering(components, id, "pursue");
        } else if (token.kind === "collision-stay") {
          components.setComponent(id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: null,
          });
          setPetSteering(components, id, "stand");
        }
        break;
    }
    token.consumed = true;
  });
}

// ── RompProgressSystem ─────────────────────────────────────────────────────
//
// Advances a live play-romp: every ROMP_HOP_INTERVAL the pet picks a short
// dash target and jumps toward it, until RompState.endsAt. A higher-priority
// claim (collision, user, social) taking the pet over cancels the romp
// quietly — the interrupter owns the pet's motion from that point.

export function runRompProgressSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(["RompState", "Transform"], (id, [romp, transform]) => {
    const decision = components.getComponent(id, "BehaviorDecisionState");
    // Ownership is by source+reason, not expiry: the romp claim expires at the
    // same instant the romp ends, so an expiry check here would make the
    // graceful-end branch below unreachable. A higher-priority interrupter
    // *overwrites* source/reason, which is what actually revokes ownership.
    if (decision?.source !== "autonomous" || decision.reason !== "play-romp") {
      components.removeComponent(id, "RompState");
      return;
    }

    if (now >= romp.endsAt || decision.expiresAt <= now) {
      components.removeComponent(id, "RompState");
      clearMotionTarget(components, id);
      components.setComponent(id, { type: "Steering", mode: "stand" });
      // A worn-out pet catches its breath before the next decision, with a
      // brief contented cue. (The dwell claim carries the play-romp history
      // forward, so its repeat-cooldown survives the breather.)
      const personality = components.getComponent(id, "Personality");
      if (personality) {
        claim(
          components,
          id,
          "autonomous",
          now,
          ARRIVAL_DWELL_REASON,
          now + arrivalDwellMs(personality, random),
        );
      } else {
        decision.expiresAt = now;
      }
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "romp",
        mood: "happy",
        emote: "sparkle",
        label: null,
        startedAt: now,
        expiresAt: now + ROMP_END_CUE_MS,
      });
      return;
    }

    if (now < romp.nextHopAt) return;
    const contact = components.getComponent(id, "ContactState");
    if (contact && !contact.grounded) return;
    if (components.getComponent(id, "JumpActionState")) return;

    const width = petWidth(components, id);
    const range =
      width *
      (ROMP_HOP_RANGE_MIN_BODY_WIDTHS +
        random.next() * (ROMP_HOP_RANGE_MAX_BODY_WIDTHS - ROMP_HOP_RANGE_MIN_BODY_WIDTHS));
    const direction = random.next() < 0.5 ? -1 : 1;
    components.setComponent(id, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: {
        x: clampToBoundsX(
          transform.position.x + direction * range,
          bounds,
          COLLISION_TARGET_MARGIN,
        ),
        y: transform.position.y,
      },
      speedFactor: ROMP_SPEED_FACTOR,
    });
    components.setComponent(id, { type: "Steering", mode: "pursue" });
    if (components.getComponent(id, "CanJump")) {
      components.setComponent(id, {
        type: "JumpActionState",
        phase: "requested",
        cooldownMs: 0,
      });
    }
    adjustDrive(components, id, { energy: -ROMP_HOP_ENERGY_COST });
    romp.nextHopAt = now + ROMP_HOP_INTERVAL_BASE_MS + random.next() * ROMP_HOP_INTERVAL_JITTER_MS;
  });
}

/** Advance the mischievous approach-then-retreat signature choreography. */
export function runFeintProgressSystem(
  components: ComponentStore,
  clock: Clock,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(["FeintState", "Transform"], (id, [feint, transform]) => {
    const decision = components.getComponent(id, "BehaviorDecisionState");
    if (decision?.source !== "autonomous" || decision.reason !== "play-feint") {
      components.removeComponent(id, "FeintState");
      return;
    }

    if (now >= feint.endsAt || decision.expiresAt <= now) {
      components.removeComponent(id, "FeintState");
      clearMotionTarget(components, id);
      setPetSteering(components, id, "stand");
      decision.expiresAt = now;
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "signature",
        mood: "happy",
        emote: "sparkle",
        label: null,
        startedAt: now,
        expiresAt: now + ROMP_END_CUE_MS,
      });
      recordPetExperience(components, id, "played", now);
      return;
    }

    const target = components.getComponent(feint.targetEntityId, "Transform");
    if (feint.phase === "approach" && now < feint.turnsAt) {
      if (target) {
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: feint.targetEntityId,
          targetPosition: { ...target.position },
          speedFactor: 0.8,
        });
        setPetSteering(components, id, "pursue");
      }
      return;
    }

    if (feint.phase === "approach") {
      const targetX = target?.position.x ?? transform.position.x;
      const fallbackDirection = id < feint.targetEntityId ? -1 : 1;
      const direction =
        Math.abs(transform.position.x - targetX) < 1
          ? fallbackDirection
          : Math.sign(transform.position.x - targetX);
      feint.phase = "retreat";
      components.setComponent(id, {
        type: "MotionTarget",
        targetEntityId: null,
        targetPosition: {
          x: clampToBoundsX(
            transform.position.x + direction * petWidth(components, id) * FEINT_RETREAT_BODY_WIDTHS,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: transform.position.y,
        },
        speedFactor: 1.2,
      });
      setPetSteering(components, id, "pursue");
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "signature",
        mood: "excited",
        emote: "exclaim",
        label: null,
        startedAt: now,
        expiresAt: feint.endsAt,
      });
    }
  });
}

function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampToBoundsX(value: number, bounds: { x?: number; width: number }, margin: number) {
  const min = (bounds.x ?? 0) + margin;
  const max = (bounds.x ?? 0) + bounds.width - margin;
  return clamp(value, min, max);
}

function clampToBoundsY(value: number, bounds: { y?: number; height: number }, margin: number) {
  const min = (bounds.y ?? 0) + margin;
  const max = (bounds.y ?? 0) + bounds.height - margin;
  return clamp(value, min, max);
}

function petWidth(components: ComponentStore, id: string): number {
  return components.getComponent(id, "PhysicsBody")?.width ?? DEFAULT_BEHAVIOR_BODY_WIDTH;
}

// ── System descriptors ─────────────────────────────────────────────────────

export const SpeechExpirationSystem: SimulationSystem<WorldStepContext> = {
  name: "SpeechExpirationSystem",
  dependsOn: ["UserInteractionBehaviorSystem"],
  reads: ["AgentChannelState"],
  writes: ["AgentChannelState"],
  update(ctx) {
    runAgentChannelMessageExpirationSystem(ctx.components, ctx.clock);
  },
};

export const PetExpressionExpirationSystem: SimulationSystem<WorldStepContext> = {
  name: "PetExpressionExpirationSystem",
  dependsOn: ["SpeechExpirationSystem"],
  reads: ["PetExpressionState"],
  writes: ["PetExpressionState"],
  update(ctx) {
    runPetExpressionExpirationSystem(ctx.components, ctx.clock);
  },
};

export const PettingDetectionSystem: SimulationSystem<WorldStepContext> = {
  name: "PettingDetectionSystem",
  dependsOn: ["UserInteractionBehaviorSystem"],
  reads: [
    "CursorState",
    "Transform",
    "PhysicsBody",
    "PetIdentity",
    "Personality",
    "DragInteraction",
    "BehaviorDecisionState",
    "PetExpressionState",
    "AgentTaskState",
    "AgentChannelState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "BehaviorDecisionState",
    "PetExpressionState",
    "Steering",
    "MotionTarget",
    "PhysicsVelocity",
    "TaskMovementHold",
    "AgentTaskState",
    "AgentChannelState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runPettingDetectionSystem(ctx.components, ctx.clock, ctx.physics, ctx.random);
  },
};

// Runs after PettingDetectionSystem so a live petting claim wins over the
// plain hover reaction (both claim at user-interaction priority).
export const HoverReactionSystem: SimulationSystem<WorldStepContext> = {
  name: "HoverReactionSystem",
  dependsOn: ["PettingDetectionSystem"],
  reads: [
    "CursorState",
    "Transform",
    "PhysicsBody",
    "PetIdentity",
    "Personality",
    "Steering",
    "TaskMovementHold",
    "DragInteraction",
    "BehaviorDecisionState",
  ],
  writes: [
    "BehaviorDecisionState",
    "PetExpressionState",
    "Steering",
    "MotionTarget",
    "PhysicsVelocity",
  ],
  update(ctx) {
    runHoverReactionSystem(ctx.components, ctx.clock, ctx.physics);
  },
};

export const AgentTaskEventSystem: SimulationSystem<WorldStepContext> = {
  name: "AgentTaskEventSystem",
  dependsOn: ["PetExpressionExpirationSystem"],
  reads: ["AgentBinding", "SpeechProfile", "ActivityState", "MoodState", "RecentExperienceMemory"],
  writes: [
    "AgentTaskState",
    "AgentChannelState",
    "ActivityState",
    "BehaviorDecisionState",
    "TaskMovementHold",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runAgentTaskEventSystem(
      ctx.components,
      ctx.events.drainWhere((event) => event.kind === "agent"),
      ctx.clock,
      ctx.random,
    );
  },
};

export const TaskMovementHoldSystem: SimulationSystem<WorldStepContext> = {
  name: "TaskMovementHoldSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["TaskMovementHold"],
  writes: ["MotionTarget", "PhysicsVelocity"],
  update(ctx) {
    runTaskMovementHoldSystem(ctx.components, ctx.physics);
  },
};

export const CollisionBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "CollisionBehaviorSystem",
  dependsOn: ["AgentTaskEventSystem"],
  reads: [
    "Transform",
    "PhysicsBody",
    "Steering",
    "MotionTarget",
    "Personality",
    "BehaviorDecisionState",
    "PendingReaction",
    "PetCollision",
    "AgentTaskState",
    "ClimbingTag",
    "AirborneTag",
    "ClimbIntentState",
    "SocialSessionMember",
    "CollisionMemory",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "PendingReaction",
    "BehaviorDecisionState",
    "MotionTarget",
    "Steering",
    "PetExpressionState",
    "CollisionMemory",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runCollisionBehaviorSystem(ctx.components, ctx.bounds, ctx.clock);
  },
};

export const WorkingBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "WorkingBehaviorSystem",
  dependsOn: ["CollisionBehaviorSystem"],
  reads: [
    "AgentTaskState",
    "Personality",
    "MotionTarget",
    "Transform",
    "BehaviorDecisionState",
    "PhysicsBody",
  ],
  writes: ["MotionTarget", "Steering", "BehaviorDecisionState"],
  update(ctx) {
    runWorkingBehaviorSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const BehaviorDecisionSystem: SimulationSystem<WorldStepContext> = {
  name: "BehaviorDecisionSystem",
  dependsOn: ["WorkingBehaviorSystem"],
  reads: [
    "Steering",
    "MotionTarget",
    "Transform",
    "Personality",
    "BehaviorDecisionState",
    "AgentTaskState",
    "ClimbIntentState",
    "ClimbingTag",
    "Perception",
    "PendingReaction",
    "FlyingTag",
    "WalkingTag",
    "CanJump",
    "JumpActionState",
    "ContactState",
    "CanWallClimb",
    "ClimbDismountState",
    "Drives",
    "MoodState",
    "TaskMovementHold",
    // B4: bump-to-greet eligibility (drops collision-engage for social pairs).
    "CanSocialize",
    "SocialSessionMember",
  ],
  writes: ["BehaviorDecisionToken", "BehaviorDecisionState", "PendingReaction"],
  update(ctx) {
    runBehaviorDecisionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const BehaviorPlanningSystem: SimulationSystem<WorldStepContext> = {
  name: "BehaviorPlanningSystem",
  dependsOn: ["AutonomousBehaviorSystem"],
  reads: ["BehaviorDecisionToken", "JumpActionState", "MoodState", "RecentExperienceMemory"],
  writes: [
    "Steering",
    "MotionTarget",
    "JumpActionState",
    "ClimbIntentState",
    "BehaviorDecisionToken",
    "Drives",
    "PetExpressionState",
    "FeintState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runBehaviorPlanningSystem(ctx.components, ctx.clock);
  },
};

export const AutonomousBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "AutonomousBehaviorSystem",
  dependsOn: ["BehaviorDecisionSystem"],
  reads: ["IdleConversation", "SpeechProfile", "AgentChannelState", "ActivityState"],
  writes: ["AgentChannelState", "BehaviorDecisionState"],
  update(ctx) {
    runAutonomousBehaviorSystem(ctx.components, ctx.clock, ctx.random);
  },
};

export const ArrivalBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "ArrivalBehaviorSystem",
  dependsOn: ["ClimbApproachSystem"],
  reads: [
    "Transform",
    "MotionTarget",
    "WandersOnArrival",
    "Steering",
    "ClimbingTag",
    "Perception",
    "ClimbIntentState",
    "Personality",
    "BehaviorDecisionState",
  ],
  writes: ["MotionTarget", "Steering", "PetExpressionState", "Drives", "BehaviorDecisionState"],
  update(ctx) {
    runArrivalBehaviorSystem(ctx.components, ctx.clock, ctx.random);
  },
};

export const PersonalSpaceSystem: SimulationSystem<WorldStepContext> = {
  name: "PersonalSpaceSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "PetCollision",
    "Steering",
    "MotionTarget",
    "Transform",
    "PetIdentity",
    "WalkingTag",
    "FlyingTag",
    "ClimbingTag",
    "ContactState",
    "PendingReaction",
    "BehaviorDecisionState",
    "PhysicsBody",
  ],
  writes: ["MotionTarget", "Steering", "BehaviorDecisionState"],
  update(ctx) {
    runPersonalSpaceSystem(ctx.components, ctx.clock, ctx.bounds);
  },
};

export const RompProgressSystem: SimulationSystem<WorldStepContext> = {
  name: "RompProgressSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "RompState",
    "Transform",
    "BehaviorDecisionState",
    "ContactState",
    "JumpActionState",
    "PhysicsBody",
    "Drives",
  ],
  writes: [
    "RompState",
    "MotionTarget",
    "Steering",
    "JumpActionState",
    "PetExpressionState",
    "BehaviorDecisionState",
    "Drives",
  ],
  update(ctx) {
    runRompProgressSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const FeintProgressSystem: SimulationSystem<WorldStepContext> = {
  name: "FeintProgressSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "FeintState",
    "Transform",
    "PhysicsBody",
    "BehaviorDecisionState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "FeintState",
    "MotionTarget",
    "Steering",
    "PetExpressionState",
    "BehaviorDecisionState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runFeintProgressSystem(ctx.components, ctx.clock, ctx.bounds);
  },
};
