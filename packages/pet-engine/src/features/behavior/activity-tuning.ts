import type {
  ExpressivePoseKind,
  PetExpressionEmote,
  PetExpressionMood,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";

// ── Sustained activities ─────────────────────────────────────────────────
// Lifelike behavior happens on the tens-of-seconds scale, not the sub-second
// claim scale. Resting and playing are *activities with a duration*: their
// autonomous claim lives for the whole activity, so the decision loop stops
// re-rolling (and visibly pacing) every 500 ms.
//
// These numbers are read from three sides — the decision system rolls a
// duration, the planning system materializes it, and the progress systems
// advance it — so they live here rather than beside any one of them.

// ── Drives satisfaction hooks ────────────────────────────────────────────
// Magnitudes on the same 0..1 scale as DrivesComponent fields. Costs are small
// enough that a pet needs several jumps before it visibly tires.
export const JUMP_ENERGY_COST = 0.08;

// play-romp: playful pets string hops and dashes together for a while.
export const ROMP_BASE_MS = 4_000;
export const ROMP_EXTRA_MS = 4_000;
export const ROMP_HOP_INTERVAL_BASE_MS = 550;
export const ROMP_HOP_INTERVAL_JITTER_MS = 450;
export const ROMP_HOP_RANGE_MIN_BODY_WIDTHS = 2;
export const ROMP_HOP_RANGE_MAX_BODY_WIDTHS = 5;
export const ROMP_SPEED_FACTOR = 1.15;
export const ROMP_HOP_ENERGY_COST = JUMP_ENERGY_COST * 0.5;
export const ROMP_END_CUE_MS = 800;

// play-feint: mischievous pets approach as if asking for attention, then turn
// on their heel and dash away. The turn is time-based so the beat completes
// even when the target moves or the pet cannot quite reach it.
export const FEINT_BASE_MS = 3_200;
export const FEINT_EXTRA_MS = 1_200;
export const FEINT_APPROACH_MS = 1_200;
export const FEINT_RETREAT_BODY_WIDTHS = 5;
export const WITHDRAW_BODY_WIDTHS = 5;
export const WITHDRAW_DURATION_MS = 3_500;
export const STRUT_BODY_WIDTHS = 6;
export const STRUT_DURATION_MS = 4_500;
export const STRUT_SPEED_FACTOR = 0.75;

// Chasing the ball is the one errand a pet hurries on. Above 1 so a chase reads
// as urgency next to an ordinary wander, but modestly — a pet that outruns its
// own walk animation reads as sliding rather than running.
export const CHASE_PROP_SPEED_FACTOR = 1.3;

// ── Expressive idle poses ──────────────────────────────────────────────────
// Sustained, stationary gestures that exercise the otherwise agent-only sprite
// rows during ordinary autonomous life (see BehaviorDecisionKind). Like
// idle-stay and play-romp, each holds its autonomous claim for the whole pose
// so the pet reads as genuinely doing something rather than twitching. Base +
// jitter loosely track each row's sprite loop length so the animation completes
// a few cycles.
export const EXPRESSIVE_POSE_DURATIONS: Record<
  ExpressivePoseKind,
  { base: number; jitter: number }
> = {
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
export const EXPRESSIVE_POSE_CUES: Record<
  ExpressivePoseKind,
  { mood: PetExpressionMood; emote: PetExpressionEmote }
> = {
  greet: { mood: "happy", emote: "sparkle" },
  // Humming while tidying — "none" left the most conscientious pose entirely
  // unreadable next to a plain idle.
  groom: { mood: "working", emote: "music" },
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
  caper: { mood: "excited", emote: "music" },
  "check-in": { mood: "love", emote: "heart" },
  "hide-away": { mood: "thinking", emote: "dots" },
  "explore-nook": { mood: "thinking", emote: "question" },
  "tidy-up": { mood: "working", emote: "music" },
  posture: { mood: "excited", emote: "exclaim" },
  nurture: { mood: "love", emote: "heart" },
  scheme: { mood: "excited", emote: "sparkle" },
  lounge: { mood: "sleepy", emote: "zzz" },
  center: { mood: "happy", emote: "dots" },
  preen: { mood: "working", emote: "none" },
  "startle-scan": { mood: "confused", emote: "sweat" },
  appraise: { mood: "thinking", emote: "dots" },
};

export function expressivePoseDurationMs(kind: ExpressivePoseKind, random: RandomSource): number {
  const { base, jitter } = EXPRESSIVE_POSE_DURATIONS[kind];
  return Math.round(base + random.next() * jitter);
}
