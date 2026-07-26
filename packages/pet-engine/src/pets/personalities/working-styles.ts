import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";

/**
 * The stationary beat a pet holds while its bound agent is working.
 *
 * A working pet used to have exactly two states — stand on the "running" row
 * forever, or take a short walk — so thirteen catalog personalities all looked
 * identical during the one state the user watches the most. These reasons give
 * the hold a *character*: each names a pose choreography (see
 * pose-choreography.ts) and a canonical activity label, so a working pet reads
 * as its own personality rather than a generic busy sprite.
 *
 * `working-focus` stays first and keeps its name: it is the pre-existing beat,
 * and its choreography still opens on the `running` row it used to hold.
 */
export const WORKING_FOCUS_REASONS = [
  "working-focus", // heads-down, steady work with a breath between passes
  "working-tinker", // restless fiddling, glancing at the result
  "working-ponder", // works, then looks up to think it through
  "working-fuss", // anxious re-checking
  "working-loaf", // works in the gaps between long, easy pauses
] as const;

export type WorkingFocusReason = (typeof WORKING_FOCUS_REASONS)[number];

/**
 * Claim reason for the pacing beat — a short walk to a nearby spot. Unchanged
 * from the original wander beat so existing collision/claim bookkeeping that
 * names it keeps working.
 */
export const WORKING_PACE_REASON = "working-wander";

export type WorkingStyle = {
  /** The stationary beat this personality plays while the agent works. */
  focusReason: WorkingFocusReason;
  /** Probability (0..1) of pacing to a nearby spot instead of holding the beat. */
  paceChance: number;
  /** How long one focus beat is held before the pet re-decides. */
  focusHoldMs: number;
};

/**
 * Working identity per Personality Catalog entry.
 *
 * Two axes carry the difference: *what the hold looks like* (focusReason) and
 * *how restless the pet is* (paceChance / focusHoldMs). A steady pet plants
 * itself for two seconds at a time; a mischievous one is off pacing every other
 * beat. Values are deliberately spread — near-identical numbers made the
 * personalities converge in practice (same lesson as behavior-signatures.ts).
 */
export const PERSONALITY_WORKING_STYLES: Record<PetPersonalityId, WorkingStyle> = {
  playful: { focusReason: "working-tinker", paceChance: 0.45, focusHoldMs: 1_100 },
  attentive: { focusReason: "working-ponder", paceChance: 0.3, focusHoldMs: 1_500 },
  reserved: { focusReason: "working-focus", paceChance: 0.15, focusHoldMs: 2_000 },
  curious: { focusReason: "working-tinker", paceChance: 0.4, focusHoldMs: 1_200 },
  steady: { focusReason: "working-focus", paceChance: 0.1, focusHoldMs: 2_200 },
  feisty: { focusReason: "working-tinker", paceChance: 0.4, focusHoldMs: 1_000 },
  gentle: { focusReason: "working-ponder", paceChance: 0.25, focusHoldMs: 1_600 },
  mischievous: { focusReason: "working-tinker", paceChance: 0.5, focusHoldMs: 900 },
  lazy: { focusReason: "working-loaf", paceChance: 0.05, focusHoldMs: 2_600 },
  zen: { focusReason: "working-ponder", paceChance: 0.05, focusHoldMs: 2_600 },
  aloof: { focusReason: "working-loaf", paceChance: 0.2, focusHoldMs: 1_800 },
  skittish: { focusReason: "working-fuss", paceChance: 0.45, focusHoldMs: 800 },
  shrewd: { focusReason: "working-ponder", paceChance: 0.15, focusHoldMs: 2_000 },
};

// Trait-derived fallback bounds for pets with no catalog identity (custom
// personalities, fixtures, older saved state). Chosen so the derived styles land
// inside the same range the catalog table spans.
const MIN_FOCUS_HOLD_MS = 800;
const MAX_FOCUS_HOLD_MS = 2_600;
const BASE_FOCUS_HOLD_MS = 1_500;

/** Jitter band applied to a focus hold so repeats never land on the same beat. */
const FOCUS_HOLD_JITTER = 0.25;

/** How long the pacing claim lives — the walk itself outlives it. */
export const WORKING_PACE_CLAIM_MS = 750;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The pre-catalog distraction score: low conscientiousness plus high
 * extraversion means a pet that keeps wandering off mid-task. Kept as the
 * trait-only pacing tendency, now read as a probability rather than a hard
 * threshold, so an uncatalogued pet still mixes both beats.
 */
function derivedPaceChance(p: PersonalityComponent): number {
  const distraction = (1 - p.conscientiousness) * 0.7 + p.extraversion * 0.3;
  return clamp(distraction * 0.6, 0.05, 0.5);
}

function derivedFocusReason(p: PersonalityComponent): WorkingFocusReason {
  if (p.neuroticism >= 0.65) return "working-fuss";
  if (p.conscientiousness >= 0.65) return "working-focus";
  if (p.conscientiousness <= 0.35 && p.extraversion <= 0.4) return "working-loaf";
  if (p.openness >= 0.6) return "working-tinker";
  return "working-ponder";
}

function derivedFocusHoldMs(p: PersonalityComponent): number {
  const holdMs =
    BASE_FOCUS_HOLD_MS +
    p.conscientiousness * 900 -
    p.neuroticism * 500 -
    p.extraversion * 300 +
    (1 - p.openness) * 200;
  return Math.round(clamp(holdMs, MIN_FOCUS_HOLD_MS, MAX_FOCUS_HOLD_MS));
}

/**
 * The working style for a pet: its catalog entry when it has one, otherwise a
 * style derived from raw OCEAN traits so every pet gets a characterful hold.
 */
export function workingStyle(personality: PersonalityComponent): WorkingStyle {
  const catalogStyle = personality.catalogId
    ? PERSONALITY_WORKING_STYLES[personality.catalogId]
    : undefined;
  if (catalogStyle) return catalogStyle;

  return {
    focusReason: derivedFocusReason(personality),
    paceChance: derivedPaceChance(personality),
    focusHoldMs: derivedFocusHoldMs(personality),
  };
}

/**
 * A focus hold with jitter applied. Re-claiming the same beat restarts its
 * choreography, so identical hold lengths would lock a pet into one repeating
 * loop; the jitter keeps successive holds landing on different beats.
 */
export function jitteredFocusHoldMs(style: WorkingStyle, roll: number): number {
  const factor = 1 - FOCUS_HOLD_JITTER + roll * FOCUS_HOLD_JITTER * 2;
  return Math.round(style.focusHoldMs * factor);
}

/** Whether a claim reason is one of the working beats. */
export function isWorkingReason(reason: string): boolean {
  return reason === WORKING_PACE_REASON || WORKING_FOCUS_REASONS.includes(reason as never);
}
