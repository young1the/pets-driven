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
 * Invariant: every expressive-activity entry's FIRST beat is the row that pose
 * used to hold, so a freshly-claimed pose still reads exactly as before and
 * only its continuation is new. The acknowledge beats at the bottom are exempt:
 * they replace no earlier row, because before them the acknowledge claim had no
 * pose at all.
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
  // ── Second signature poses ────────────────────────────────────────────────
  // Same existing rows, new rhythms, so each preset's two beats stay legible.
  // A skip-and-settle — the giddy cousin of a plain wave.
  caper: [
    { state: "waving", durationMs: 320 },
    { state: "running", durationMs: 300 },
    { state: "idle", durationMs: 220 },
  ],
  // Trot up, hold close, and give a small wave — an "I'm right here" check.
  "check-in": [
    { state: "waiting", durationMs: 560 },
    { state: "waving", durationMs: 360 },
  ],
  // A quick glance out, then a long, still tuck-away.
  "hide-away": [
    { state: "review", durationMs: 280 },
    { state: "idle", durationMs: 760 },
  ],
  // Peer in, shuffle deeper, peer again — nosing into a corner.
  "explore-nook": [
    { state: "review", durationMs: 480 },
    { state: "running", durationMs: 320 },
    { state: "review", durationMs: 400 },
  ],
  // A brisk straighten with a satisfied breath between passes.
  "tidy-up": [
    { state: "running", durationMs: 760 },
    { state: "idle", durationMs: 280 },
  ],
  // Puff up, freeze the pose, puff up again — all show.
  posture: [
    { state: "waving", durationMs: 300 },
    { state: "failed", durationMs: 260 },
    { state: "idle", durationMs: 220 },
  ],
  // Reach out, then linger warmly — a doting little fuss.
  nurture: [
    { state: "waving", durationMs: 440 },
    { state: "waiting", durationMs: 600 },
  ],
  // A sly examine, a scuttle, and a look back — plotting.
  scheme: [
    { state: "review", durationMs: 380 },
    { state: "running", durationMs: 320 },
    { state: "idle", durationMs: 200 },
  ],
  // Mostly sprawled, with the barest lazy stir.
  lounge: [
    { state: "idle", durationMs: 900 },
    { state: "waving", durationMs: 240 },
  ],
  // A long poised hold with a slow, even settle — the stillest of stances.
  center: [
    { state: "waiting", durationMs: 820 },
    { state: "idle", durationMs: 640 },
  ],
  // Unhurried self-grooming, cool and self-contained.
  preen: [
    { state: "running", durationMs: 640 },
    { state: "idle", durationMs: 380 },
  ],
  // A jumpy sweep — startle, scan, startle again.
  "startle-scan": [
    { state: "failed", durationMs: 360 },
    { state: "review", durationMs: 420 },
    { state: "idle", durationMs: 200 },
  ],
  // A measured study with a beat of calculation between reads.
  appraise: [
    { state: "review", durationMs: 620 },
    { state: "idle", durationMs: 380 },
    { state: "review", durationMs: 340 },
  ],
  // ── Acknowledge beats ─────────────────────────────────────────────────────
  // Unlike every entry above, these two are not autonomous activities: they are
  // keyed by the `acknowledge-<status>` claim raised when the user releases a
  // settled task (by petting or by double-click). Without them the pet dropped
  // its waiting/review pose and simply stood there, so the release read as
  // nothing happening (PET-23). Both open on `waving` — the wave IS the answer,
  // and reopening on the status row the pet just left would read as still
  // holding it. See pet-animation-state.ts for why these reasons are allowed to
  // pose despite not being autonomous.
  // The ask is over: a brisk wave-off, then settle.
  "acknowledge-waiting": [
    { state: "waving", durationMs: 300 },
    { state: "idle", durationMs: 200 },
    { state: "waving", durationMs: 300 },
    { state: "idle", durationMs: 640 },
  ],
  // A fuller, prouder sweep with a satisfied stand between passes.
  "acknowledge-completed": [
    { state: "waving", durationMs: 520 },
    { state: "idle", durationMs: 360 },
    { state: "waving", durationMs: 260 },
    { state: "idle", durationMs: 700 },
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
