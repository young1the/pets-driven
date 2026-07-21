import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";

/**
 * One held row within a choreography.
 *
 * A beat is coarser than an atlas frame: the row's own frame animation keeps
 * playing underneath (see getAtlasFrame), and the beat only decides *which* row
 * is playing right now.
 */
export type ChoreographyBeat = {
  state: PetAnimationState;
  durationMs: number;
};

export type PoseChoreography = readonly ChoreographyBeat[];

/**
 * Sustained expressive activities (see BehaviorDecisionKind) hold their
 * autonomous claim for a whole pose while standing the pet still. That used to
 * pin one fixed sprite row for the entire hold, which meant the four poses that
 * share the `review` row — observe / meditate / peek / inspect — were literally
 * the same picture for seconds at a time.
 *
 * A choreography restores the difference without new art: each pose is a short
 * *rhythm* of existing rows. `peek` glances and hides; `observe` looks, blinks,
 * looks again; `meditate` alternates slowly; `inspect` shuffles closer between
 * looks. Same nine rows, thirteen readable behaviors.
 *
 * Invariant: every entry's FIRST beat is the row that pose used to hold, so a
 * freshly-claimed pose still reads exactly as before and only its continuation
 * is new.
 */
const EXPRESSIVE_POSE_CHOREOGRAPHY: Partial<Record<string, PoseChoreography>> = {
  // Wave, pause, wave again — an eager hello rather than one long wave.
  greet: [
    { state: "waving", durationMs: 520 },
    { state: "idle", durationMs: 260 },
    { state: "waving", durationMs: 520 },
    { state: "idle", durationMs: 400 },
  ],
  // Absorbed fussing, broken by short settles.
  groom: [
    { state: "running", durationMs: 700 },
    { state: "idle", durationMs: 320 },
  ],
  // A double-take: look, blink, look again.
  observe: [
    { state: "review", durationMs: 640 },
    { state: "idle", durationMs: 240 },
    { state: "review", durationMs: 640 },
  ],
  // Expectant hold, then a small "come here" wave.
  beckon: [
    { state: "waiting", durationMs: 620 },
    { state: "waving", durationMs: 380 },
  ],
  // Anxious loop with a beat of frozen stillness.
  fret: [
    { state: "failed", durationMs: 460 },
    { state: "idle", durationMs: 200 },
  ],
  // Deliberately a single long beat: a nap should be maximally still.
  nap: [{ state: "idle", durationMs: 1_200 }],
  // Slow, even alternation — the opposite tempo to observe's quick double-take.
  meditate: [
    { state: "review", durationMs: 900 },
    { state: "idle", durationMs: 700 },
  ],
  // Hold the post, then sweep the surroundings.
  "keep-watch": [
    { state: "waiting", durationMs: 800 },
    { state: "review", durationMs: 500 },
  ],
  // Brief glance, long hide — the inverse rhythm of observe, which is what
  // makes "peeking" read as furtive on the very same row.
  peek: [
    { state: "review", durationMs: 380 },
    { state: "idle", durationMs: 620 },
  ],
  // Examine, shuffle closer, examine again.
  inspect: [
    { state: "review", durationMs: 520 },
    { state: "running", durationMs: 300 },
  ],
  // A steady work cadence with a breath between passes.
  "follow-routine": [
    { state: "running", durationMs: 900 },
    { state: "idle", durationMs: 260 },
  ],
  // Reach out, then simply stay present — the staying is the comfort.
  "offer-comfort": [
    { state: "waving", durationMs: 480 },
    { state: "waiting", durationMs: 620 },
  ],
  // Tense, then a watchful hold.
  "stand-lookout": [
    { state: "failed", durationMs: 520 },
    { state: "waiting", durationMs: 700 },
  ],
};

/**
 * Picks the row a choreography is on at `elapsedMs`. Loops, so a pose held
 * longer than its rhythm keeps cycling instead of freezing on the last beat.
 */
export function resolveChoreographyBeat(
  choreography: PoseChoreography,
  elapsedMs: number,
): PetAnimationState | undefined {
  const total = choreography.reduce((sum, beat) => sum + Math.max(0, beat.durationMs), 0);
  if (total <= 0) {
    return choreography[0]?.state;
  }

  // Negative elapsed can only come from a claim stamped in the future (clock
  // skew between decision and snapshot); treat it as the opening beat.
  let remaining = elapsedMs <= 0 ? 0 : elapsedMs % total;
  for (const beat of choreography) {
    const duration = Math.max(0, beat.durationMs);
    if (remaining < duration) {
      return beat.state;
    }
    remaining -= duration;
  }

  return choreography[choreography.length - 1]?.state;
}

/**
 * The row an expressive pose is showing, given how long its claim has been
 * held. Returns undefined when the reason names no choreography, letting the
 * caller fall through to locomotion/idle.
 */
export function getExpressivePoseState(
  reason: string,
  elapsedMs: number,
): PetAnimationState | undefined {
  const choreography = EXPRESSIVE_POSE_CHOREOGRAPHY[reason];
  if (!choreography) {
    return undefined;
  }
  return resolveChoreographyBeat(choreography, elapsedMs);
}
