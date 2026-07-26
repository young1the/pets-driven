import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";

export type WorkingBehaviorStyle = {
  focusScore: number;
  reviewScore: number;
  paceScore: number;
  holdMs: number;
};

/**
 * Minimum time a stationary work behavior remains readable. Hook pulses never
 * restart this window; they can only influence the next ordinary decision.
 */
export const MIN_WORKING_BEHAVIOR_HOLD_MS = 1_200;
export const TOOL_ACTIVITY_FRESHNESS_MS = 12_000;

export const PERSONALITY_WORKING_STYLES: Record<PetPersonalityId, WorkingBehaviorStyle> = {
  playful: { focusScore: 0.45, reviewScore: 0.5, paceScore: 0.9, holdMs: 1_300 },
  attentive: { focusScore: 0.7, reviewScore: 1.0, paceScore: 0.45, holdMs: 1_700 },
  reserved: { focusScore: 0.9, reviewScore: 0.55, paceScore: 0.2, holdMs: 2_100 },
  curious: { focusScore: 0.55, reviewScore: 1.0, paceScore: 0.65, holdMs: 1_500 },
  steady: { focusScore: 1.1, reviewScore: 0.7, paceScore: 0.15, holdMs: 2_300 },
  feisty: { focusScore: 0.65, reviewScore: 0.4, paceScore: 0.85, holdMs: 1_300 },
  gentle: { focusScore: 0.65, reviewScore: 0.85, paceScore: 0.35, holdMs: 1_800 },
  mischievous: { focusScore: 0.35, reviewScore: 0.55, paceScore: 1.0, holdMs: 1_200 },
  lazy: { focusScore: 0.7, reviewScore: 0.35, paceScore: 0.1, holdMs: 2_600 },
  zen: { focusScore: 0.6, reviewScore: 0.95, paceScore: 0.1, holdMs: 2_600 },
  aloof: { focusScore: 0.65, reviewScore: 0.75, paceScore: 0.3, holdMs: 2_000 },
  skittish: { focusScore: 0.45, reviewScore: 0.7, paceScore: 0.95, holdMs: 1_200 },
  shrewd: { focusScore: 0.8, reviewScore: 1.05, paceScore: 0.2, holdMs: 2_100 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Working behavior weights for catalog and custom personalities. */
export function workingStyle(personality: PersonalityComponent): WorkingBehaviorStyle {
  const catalogStyle = personality.catalogId
    ? PERSONALITY_WORKING_STYLES[personality.catalogId]
    : undefined;
  if (catalogStyle) return catalogStyle;

  return {
    focusScore: 0.35 + personality.conscientiousness * 0.75,
    reviewScore: 0.3 + personality.openness * 0.75,
    paceScore: clamp(
      (1 - personality.conscientiousness) * 0.65 + personality.extraversion * 0.35,
      0.1,
      1,
    ),
    holdMs: Math.round(
      clamp(
        1_500 +
          personality.conscientiousness * 900 -
          personality.neuroticism * 400 -
          personality.extraversion * 200,
        MIN_WORKING_BEHAVIOR_HOLD_MS,
        2_600,
      ),
    ),
  };
}

/** Mild jitter keeps repeated decisions organic without weakening the hold threshold. */
export function workingBehaviorHoldMs(style: WorkingBehaviorStyle, roll: number): number {
  const jittered = Math.round(style.holdMs * (0.9 + roll * 0.2));
  return Math.max(MIN_WORKING_BEHAVIOR_HOLD_MS, jittered);
}
