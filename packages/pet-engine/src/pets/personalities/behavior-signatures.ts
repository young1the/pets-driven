import type { BehaviorDecisionKind } from "@pets-driven/pet-engine/features/behavior/components";
import type { SocialSessionKind } from "@pets-driven/pet-engine/features/social/components";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";

type BehaviorSignature = {
  primaryDecision: BehaviorDecisionKind;
  decisionBias: Partial<Record<BehaviorDecisionKind, number>>;
  idleDurationScale: number;
  arrivalDwellScale: number;
  socialKindScale: Record<SocialSessionKind, number>;
};

const NEUTRAL_SOCIAL_SCALE: Record<SocialSessionKind, number> = {
  greet: 1,
  chat: 1,
  chase: 1,
};

/**
 * Runtime behavior identity for each Personality Catalog entry.
 *
 * OCEAN remains the continuous temperament layer. These signatures add the
 * categorical silhouette promised by each preset: which beat it is known for,
 * how long it holds a rest, and what it tends to do with friends. Additive
 * decision biases are intentionally large enough to survive softmax sampling;
 * tiny trait-only nudges made distinct catalog entries converge in practice.
 */
export const PERSONALITY_BEHAVIOR_SIGNATURES: Record<
  PetPersonalityId,
  BehaviorSignature
> = {
  playful: {
    primaryDecision: "play-romp",
    decisionBias: { "play-romp": 0.55, "chase-cursor": 0.25, "idle-stay": -0.25 },
    idleDurationScale: 0.65,
    arrivalDwellScale: 0.7,
    socialKindScale: { greet: 0.8, chat: 0.9, chase: 2.4 },
  },
  attentive: {
    primaryDecision: "seek-user",
    decisionBias: { "seek-user": 0.6, beckon: 0.35, greet: 0.2, "approach-pet": -0.2 },
    idleDurationScale: 0.9,
    arrivalDwellScale: 0.9,
    socialKindScale: { greet: 1.1, chat: 1.8, chase: 0.6 },
  },
  reserved: {
    primaryDecision: "idle-stay",
    decisionBias: { "idle-stay": 0.45, observe: 0.2, fret: -0.2, "flee-from-pet": 0.1 },
    idleDurationScale: 1.45,
    arrivalDwellScale: 1.35,
    socialKindScale: { greet: 1.5, chat: 0.7, chase: 0.3 },
  },
  curious: {
    primaryDecision: "observe",
    decisionBias: { observe: 0.5, "request-climb": 0.35, "wander-far": 0.25, greet: -0.15 },
    idleDurationScale: 0.85,
    arrivalDwellScale: 0.8,
    socialKindScale: { greet: 0.7, chat: 1.7, chase: 1.1 },
  },
  steady: {
    primaryDecision: "groom",
    decisionBias: { groom: 0.55, "idle-stay": 0.15, "play-romp": -0.35, fret: -0.3 },
    idleDurationScale: 1.25,
    arrivalDwellScale: 1.35,
    socialKindScale: { greet: 1.5, chat: 1.1, chase: 0.45 },
  },
  bold: {
    primaryDecision: "collision-unfazed",
    decisionBias: {
      "collision-unfazed": 0.65,
      "collision-engage": 0.35,
      "wander-far": 0.2,
      greet: -0.2,
      "play-romp": -0.1,
    },
    idleDurationScale: 0.7,
    arrivalDwellScale: 0.65,
    socialKindScale: { greet: 0.7, chat: 0.8, chase: 1.7 },
  },
  gentle: {
    primaryDecision: "greet",
    decisionBias: { greet: 0.45, "approach-pet": 0.3, beckon: 0.2, "play-romp": -0.35 },
    idleDurationScale: 1.1,
    arrivalDwellScale: 1.15,
    socialKindScale: { greet: 2.2, chat: 1.2, chase: 0.35 },
  },
  mischievous: {
    primaryDecision: "chase-cursor",
    decisionBias: {
      "chase-cursor": 0.55,
      "request-jump": 0.3,
      "wander-far": 0.2,
      groom: -0.45,
      greet: -0.2,
    },
    idleDurationScale: 0.65,
    arrivalDwellScale: 0.6,
    socialKindScale: { greet: 0.45, chat: 0.8, chase: 2.5 },
  },
  lazy: {
    primaryDecision: "idle-stay",
    decisionBias: {
      "idle-stay": 0.7,
      groom: 0.15,
      "wander-far": -0.35,
      "request-jump": -0.6,
      "play-romp": -0.7,
    },
    idleDurationScale: 1.9,
    arrivalDwellScale: 1.7,
    socialKindScale: { greet: 1.4, chat: 1, chase: 0.2 },
  },
  zen: {
    primaryDecision: "collision-stay",
    decisionBias: {
      "collision-stay": 0.6,
      "collision-unfazed": 0.5,
      "idle-stay": 0.5,
      observe: 0.2,
      fret: -0.5,
    },
    idleDurationScale: 1.65,
    arrivalDwellScale: 1.55,
    socialKindScale: { greet: 1.9, chat: 1.1, chase: 0.2 },
  },
  aloof: {
    primaryDecision: "wander-far",
    decisionBias: {
      "wander-far": 0.3,
      observe: 0.25,
      greet: -0.65,
      beckon: -0.6,
      "approach-pet": -0.65,
    },
    idleDurationScale: 1.1,
    arrivalDwellScale: 1.1,
    socialKindScale: { greet: 1.2, chat: 0.6, chase: 0.35 },
  },
  skittish: {
    primaryDecision: "collision-flee",
    decisionBias: {
      "collision-flee": 0.7,
      "flee-from-pet": 0.6,
      fret: 0.5,
      "wander-near": 0.25,
      "idle-stay": -0.15,
    },
    idleDurationScale: 0.6,
    arrivalDwellScale: 0.55,
    socialKindScale: { greet: 1.4, chat: 0.45, chase: 0.25 },
  },
};

export function behaviorSignature(
  catalogId: PetPersonalityId | undefined,
): BehaviorSignature | null {
  return catalogId ? PERSONALITY_BEHAVIOR_SIGNATURES[catalogId] : null;
}

export function signedDecisionScore(
  catalogId: PetPersonalityId | undefined,
  kind: BehaviorDecisionKind,
  baseScore: number,
): number {
  return baseScore + (behaviorSignature(catalogId)?.decisionBias[kind] ?? 0);
}

export function personalityIdleDurationScale(
  catalogId: PetPersonalityId | undefined,
): number {
  return behaviorSignature(catalogId)?.idleDurationScale ?? 1;
}

export function personalityArrivalDwellScale(
  catalogId: PetPersonalityId | undefined,
): number {
  return behaviorSignature(catalogId)?.arrivalDwellScale ?? 1;
}

export function personalitySocialKindScale(
  catalogId: PetPersonalityId | undefined,
): Record<SocialSessionKind, number> {
  return behaviorSignature(catalogId)?.socialKindScale ?? NEUTRAL_SOCIAL_SCALE;
}
