import type { BehaviorDecisionKind } from "@pets-driven/pet-engine/features/behavior/components";
import type { PetEmoteKind, PetMood } from "@pets-driven/design-system";
import type { PetExpressionMood } from "@pets-driven/pet-engine/core/components";
import type { PetExpressionSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

export type BehaviorTokenTone =
  "affection" | "alert" | "calm" | "curious" | "motion" | "spark";

export type BehaviorTokenPresentation = {
  emote: PetEmoteKind;
  label: string;
  mood: PetMood;
  tone: BehaviorTokenTone;
};

const BEHAVIOR_TOKEN_PRESENTATION: Record<
  BehaviorDecisionKind,
  BehaviorTokenPresentation
> = {
  "wander-near": {
    emote: "question",
    label: "Nearby wander",
    mood: "thinking",
    tone: "curious",
  },
  "wander-far": {
    emote: "question",
    label: "Far wander",
    mood: "thinking",
    tone: "curious",
  },
  "seek-user": {
    emote: "exclaim",
    label: "Seeking user",
    mood: "confused",
    tone: "alert",
  },
  "request-jump": {
    emote: "sparkle",
    label: "Jump request",
    mood: "excited",
    tone: "spark",
  },
  "request-climb": {
    emote: "exclaim",
    label: "Climb request",
    mood: "working",
    tone: "motion",
  },
  "idle-stay": {
    emote: "zzz",
    label: "Staying idle",
    mood: "sleepy",
    tone: "calm",
  },
  "approach-pet": {
    emote: "heart",
    label: "Approaching pet",
    mood: "love",
    tone: "affection",
  },
  "flee-from-pet": {
    emote: "exclaim",
    label: "Fleeing from pet",
    mood: "confused",
    tone: "alert",
  },
  "collision-flee": {
    emote: "exclaim",
    label: "Collision flee",
    mood: "confused",
    tone: "alert",
  },
  "collision-engage": {
    emote: "heart",
    label: "Collision engage",
    mood: "love",
    tone: "affection",
  },
  "collision-avoid": {
    emote: "exclaim",
    label: "Collision avoid",
    mood: "confused",
    tone: "alert",
  },
  "collision-jump": {
    emote: "sparkle",
    label: "Collision jump",
    mood: "excited",
    tone: "spark",
  },
  "collision-stay": {
    emote: "zzz",
    label: "Collision stay",
    mood: "sleepy",
    tone: "calm",
  },
  "collision-unfazed": {
    emote: "question",
    label: "Collision unfazed",
    mood: "working",
    tone: "calm",
  },
};

export function presentBehaviorDecisionToken(
  kind: string | null | undefined,
): BehaviorTokenPresentation | null {
  if (!kind) return null;
  return BEHAVIOR_TOKEN_PRESENTATION[kind as BehaviorDecisionKind] ?? null;
}

function toneFromExpressionMood(mood: PetExpressionMood): BehaviorTokenTone {
  switch (mood) {
    case "love":
      return "affection";
    case "confused":
      return "alert";
    case "thinking":
      return "curious";
    case "excited":
      return "spark";
    case "sleepy":
      return "calm";
    case "working":
    case "happy":
    default:
      return "calm";
  }
}

export function presentPetExpression(
  expression: PetExpressionSnapshot | null | undefined,
): BehaviorTokenPresentation | null {
  if (!expression) return null;
  if (expression.emote === "none") return null;
  return {
    emote: expression.emote,
    label: expression.label ?? "Pet expression",
    mood: expression.mood,
    tone: toneFromExpressionMood(expression.mood),
  };
}
