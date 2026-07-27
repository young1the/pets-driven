import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import { driveResponseCurve } from "@pets-driven/pet-engine/features/drives/systems";
import type { ExpressivePoseKind, PersonalityComponent } from "./components";

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

export function scoreWanderNear(p: PersonalityComponent): number {
  // N (neuroticism) → wary, prefers short local moves; O (openness) → slight boost
  return 0.3 + p.openness * 0.1 + p.neuroticism * 0.4;
}

export function scoreWanderFar(p: PersonalityComponent, drives?: DrivesComponent): number {
  // O (openness) → exploration drive; N (neuroticism) → reluctance to venture far
  const base = 0.3 + p.openness * 0.7 - p.neuroticism * 0.2;
  if (!drives) return base;
  // Curiosity (boredom) → unresolved novelty-seeking pushes toward exploring far.
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.5, curiositySensitivity(p));
}

export function scoreSeekUser(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E (extraversion) + A (agreeableness) → approach user; N → avoidance
  const base = 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.3 - p.neuroticism * 0.3;
  if (!drives) return base;
  // Social need also nudges toward the user, smaller weight than approach-pet.
  return base + driveResponseCurve(drives.social) * driveWeight(0.3, socialSensitivity(p));
}

export function scoreJump(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E (extraversion) → action energy; O (openness) → novelty seeking
  const base = 0.2 + p.extraversion * 0.4 + p.openness * 0.3;
  if (!drives) return base;
  // Low energy (tired) suppresses the urge to jump.
  return base - driveResponseCurve(1 - drives.energy) * driveWeight(0.5, restSensitivity(p));
}

export function scoreClimb(p: PersonalityComponent, drives?: DrivesComponent): number {
  // O (openness) → exploration; E (extraversion) → physical energy
  const base = 0.2 + p.openness * 0.6 + p.extraversion * 0.2;
  if (!drives) return base;
  // Curiosity (boredom) → climbing resolves the need for novelty.
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.4, curiositySensitivity(p));
}

export function scoreIdleStay(p: PersonalityComponent, drives?: DrivesComponent): number {
  // Low E → reduced need for activity; N (neuroticism) → cautious stillness
  const base = 0.25 + (1 - p.extraversion) * 0.3 + p.neuroticism * 0.2;
  if (!drives) return base;
  // Low energy (tired) → resting becomes strongly preferred.
  return base + driveResponseCurve(1 - drives.energy) * driveWeight(0.5, restSensitivity(p));
}

// Phase 3 — social interaction score functions (require Perception.nearbyPets)

export function scoreApproachPet(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E + A → social draw; N → reluctance
  const base = 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.4 - p.neuroticism * 0.3;
  if (!drives) return base;
  // Social need (loneliness) → strongest drive pull toward another pet.
  return base + driveResponseCurve(drives.social) * driveWeight(0.6, socialSensitivity(p));
}

export function scoreFleeFromPet(p: PersonalityComponent): number {
  // N → flight instinct; A → reduces urge to flee
  return 0.1 + p.neuroticism * 0.7 - p.agreeableness * 0.4;
}

// Cursor play — laser-pointer-chase drive.

export function scoreChaseCursor(p: PersonalityComponent): number {
  // E (extraversion) + O (openness) → cat-and-laser-pointer chase instinct;
  // N (neuroticism) → suppresses the impulse. Base + weights are intentionally
  // high so playful cursor movement reliably wins for extraverted pets.
  return 0.4 + p.extraversion * 0.9 + p.openness * 0.5 - p.neuroticism * 0.5;
}

export function scorePlayRomp(p: PersonalityComponent, drives?: DrivesComponent): number {
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

export function scoreGreet(p: PersonalityComponent, drives?: DrivesComponent): number {
  // E + A → warmth toward whoever is near; N → shyness.
  const base = 0.15 + p.extraversion * 0.6 + p.agreeableness * 0.4 - p.neuroticism * 0.3;
  if (!drives) return base;
  // A lonely pet is a little keener to say hello.
  return base + driveResponseCurve(drives.social) * driveWeight(0.3, socialSensitivity(p));
}

export function scoreGroom(p: PersonalityComponent): number {
  // C → tidy self-maintenance; low E → the calm homebody settles into it.
  return 0.15 + p.conscientiousness * 0.5 + (1 - p.extraversion) * 0.25;
}

export function scoreObserve(p: PersonalityComponent, drives?: DrivesComponent): number {
  // O → curiosity; slight introvert lean (extraverts would rather approach).
  const base = 0.15 + p.openness * 0.6 - p.extraversion * 0.1;
  if (!drives) return base;
  // Boredom (unmet curiosity) makes examining the surroundings appealing.
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.4, curiositySensitivity(p));
}

export function scoreBeckon(p: PersonalityComponent, drives?: DrivesComponent): number {
  // A + E → wanting the user's company; N → hesitance.
  const base = 0.1 + p.extraversion * 0.3 + p.agreeableness * 0.3 - p.neuroticism * 0.2;
  if (!drives) return base;
  // Loneliness is the strongest pull toward an expectant "come here".
  return base + driveResponseCurve(drives.social) * driveWeight(0.5, socialSensitivity(p));
}

export function scoreFret(p: PersonalityComponent): number {
  // N → anxious sulking; E → shrugs it off. Low base keeps it occasional.
  return 0.05 + p.neuroticism * 0.55 - p.extraversion * 0.2;
}

export function scoreNap(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + (1 - p.extraversion) * 0.2;
  if (!drives) return base;
  return base + driveResponseCurve(1 - drives.energy) * driveWeight(0.45, restSensitivity(p));
}

export function scoreMeditate(p: PersonalityComponent): number {
  return 0.05 + p.conscientiousness * 0.12 + (1 - p.neuroticism) * 0.15;
}

export function scorePlayFeint(p: PersonalityComponent): number {
  return 0.05 + p.extraversion * 0.3 + p.openness * 0.2 + (1 - p.conscientiousness) * 0.15;
}

export function scoreKeepWatch(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.agreeableness * 0.25 + p.conscientiousness * 0.15;
  if (!drives) return base;
  return base + driveResponseCurve(drives.social) * driveWeight(0.25, socialSensitivity(p));
}

export function scorePeek(p: PersonalityComponent): number {
  return 0.05 + (1 - p.extraversion) * 0.2 + p.openness * 0.15;
}

export function scoreWithdraw(p: PersonalityComponent): number {
  return 0.05 + (1 - p.agreeableness) * 0.25 + (1 - p.extraversion) * 0.15;
}

export function scoreInspect(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.openness * 0.3 + (1 - p.extraversion) * 0.08;
  if (!drives) return base;
  return base + driveResponseCurve(drives.curiosity) * driveWeight(0.35, curiositySensitivity(p));
}

export function scoreFollowRoutine(p: PersonalityComponent): number {
  return 0.05 + p.conscientiousness * 0.35 + (1 - p.neuroticism) * 0.1;
}

export function scoreStrut(p: PersonalityComponent): number {
  return 0.05 + p.extraversion * 0.25 + (1 - p.neuroticism) * 0.2;
}

export function scoreOfferComfort(p: PersonalityComponent, drives?: DrivesComponent): number {
  const base = 0.05 + p.agreeableness * 0.35 + p.extraversion * 0.08;
  if (!drives) return base;
  return base + driveResponseCurve(drives.social) * driveWeight(0.2, socialSensitivity(p));
}

export function scoreStandLookout(p: PersonalityComponent): number {
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
export const SECOND_SIGNATURE_POSE: Partial<
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
