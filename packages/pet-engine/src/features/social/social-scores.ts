import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import { driveResponseCurve } from "@pets-driven/pet-engine/features/drives/systems";
import { personalitySocialKindScale } from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { SocialSessionKind } from "./components";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Dance must recur often enough to be observable in ambient play. Catalog
// scales still make reserved and low-energy pets much less likely to choose it.
const DANCE_VISIBILITY_SCALE = 1.65;

// ── Personality/drive scoring ────────────────────────────────────────────────

function socialDrive(drives: DrivesComponent | undefined): number {
  return drives ? driveResponseCurve(drives.social) : 0;
}

/**
 * Desire to open an invite this tick (before the deltaMs/rate scaling). Low
 * base + a strong extraversion term and neuroticism penalty so introverts and
 * anxious pets almost never strike up a conversation, while extraverts drive
 * most of the social life.
 */
export function initiateScore(
  p: PersonalityComponent,
  drives: DrivesComponent | undefined,
): number {
  return clamp(
    0.05 +
      p.extraversion * 0.6 +
      p.agreeableness * 0.2 +
      socialDrive(drives) * 0.4 -
      p.neuroticism * 0.4,
    0,
    1,
  );
}

/**
 * Probability the responder accepts an invite. The base is intentionally low
 * and the agreeableness/neuroticism weights steep: a prickly loner (low A) or a
 * shy/anxious pet (high N) genuinely turns most invites down, so "everyone
 * always says yes" no longer flattens the roster. Warm, calm pets still accept
 * readily. Loneliness (social drive) can coax a reluctant pet out, but only so
 * far.
 */
export function acceptChance(p: PersonalityComponent, drives: DrivesComponent | undefined): number {
  return clamp(
    0.1 +
      p.agreeableness * 0.55 +
      p.extraversion * 0.3 +
      socialDrive(drives) * 0.35 -
      p.neuroticism * 0.55,
    0.05,
    0.95,
  );
}

/**
 * Pick a session kind from the two personalities. Energetic/open pairs romp
 * or dance, warm calm pairs greet, and talkative pairs chat. Weighted random
 * keeps it varied rather than deterministic.
 */
export function socialSessionKindWeights(
  a: PersonalityComponent,
  b: PersonalityComponent,
): Array<{ kind: SocialSessionKind; weight: number }> {
  const e = (a.extraversion + b.extraversion) / 2;
  const o = (a.openness + b.openness) / 2;
  const agr = (a.agreeableness + b.agreeableness) / 2;
  const n = (a.neuroticism + b.neuroticism) / 2;
  const aScale = personalitySocialKindScale(a.catalogId);
  const bScale = personalitySocialKindScale(b.catalogId);
  const pairScale = (kind: SocialSessionKind) => Math.sqrt(aScale[kind] * bScale[kind]);
  return [
    {
      kind: "chase",
      weight: clamp(0.15 + e * 0.6 + o * 0.3 - n * 0.4, 0.02, 2) * pairScale("chase"),
    },
    {
      kind: "greet",
      weight: clamp(0.3 + agr * 0.4 + (1 - n) * 0.2, 0.02, 2) * pairScale("greet"),
    },
    {
      kind: "chat",
      weight: clamp(0.25 + e * 0.4 + agr * 0.3, 0.02, 2) * pairScale("chat"),
    },
    {
      kind: "dance",
      weight:
        clamp(0.12 + e * 0.5 + o * 0.35 + agr * 0.1 - n * 0.2, 0.02, 2) *
        pairScale("dance") *
        DANCE_VISIBILITY_SCALE,
    },
  ];
}

export function pickKind(
  a: PersonalityComponent,
  b: PersonalityComponent,
  random: RandomSource,
): SocialSessionKind {
  const weights = socialSessionKindWeights(a, b);
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let r = random.next() * total;
  for (const entry of weights) {
    r -= entry.weight;
    if (r <= 0) return entry.kind;
  }
  return "greet";
}

/** Personality/drive-weighted chance a matured bump turns into an invite. */
export function bumpInviteChance(
  p: PersonalityComponent,
  drives: DrivesComponent | undefined,
): number {
  return clamp(
    0.2 +
      p.extraversion * 0.35 +
      p.agreeableness * 0.45 -
      p.neuroticism * 0.6 +
      socialDrive(drives) * 0.35,
    0,
    0.95,
  );
}
