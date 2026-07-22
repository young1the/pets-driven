import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import { socialSessionKindWeights } from "@pets-driven/pet-engine/features/social/systems";
import {
  PERSONALITY_BEHAVIOR_SIGNATURES,
  personalityArrivalDwellScale,
  personalityIdleDurationScale,
  signedDecisionScore,
} from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { describe, expect, it } from "vitest";

function personality(catalogId: PetPersonalityId): PersonalityComponent {
  const factory = PERSONALITY_REGISTRY.find((entry) => entry.id === catalogId)?.factory;
  if (!factory) throw new Error(`Missing personality factory for ${catalogId}`);
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } = factory();
  return {
    type: "Personality",
    catalogId,
    openness,
    conscientiousness,
    extraversion,
    agreeableness,
    neuroticism,
  };
}

function strongestSocialKind(a: PetPersonalityId, b: PetPersonalityId) {
  return socialSessionKindWeights(personality(a), personality(b)).sort(
    (left, right) => right.weight - left.weight,
  )[0].kind;
}

describe("Personality Catalog behavior signatures", () => {
  it("defines one runtime signature for every catalog entry", () => {
    expect(Object.keys(PERSONALITY_BEHAVIOR_SIGNATURES).sort()).toEqual(
      PERSONALITY_REGISTRY.map((entry) => entry.id).sort(),
    );
  });

  it("separates the closest OCEAN neighbors with different primary decisions", () => {
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.playful.primaryDecision).not.toBe(
      PERSONALITY_BEHAVIOR_SIGNATURES.feisty.primaryDecision,
    );
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.reserved.primaryDecision).not.toBe(
      PERSONALITY_BEHAVIOR_SIGNATURES.skittish.primaryDecision,
    );
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.gentle.primaryDecision).not.toBe(
      PERSONALITY_BEHAVIOR_SIGNATURES.zen.primaryDecision,
    );
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.steady.primaryDecision).not.toBe(
      PERSONALITY_BEHAVIOR_SIGNATURES.zen.primaryDecision,
    );
  });

  it("turns playful toward romping while feisty favors squaring up to collisions", () => {
    expect(signedDecisionScore("playful", "play-romp", 0)).toBeGreaterThan(
      signedDecisionScore("feisty", "play-romp", 0),
    );
    expect(signedDecisionScore("feisty", "collision-engage", 0)).toBeGreaterThan(
      signedDecisionScore("playful", "collision-engage", 0),
    );
  });

  it("makes reserved settle while skittish keeps short, flighty beats", () => {
    expect(personalityIdleDurationScale("reserved")).toBeGreaterThan(
      personalityIdleDurationScale("skittish"),
    );
    expect(personalityArrivalDwellScale("reserved")).toBeGreaterThan(
      personalityArrivalDwellScale("skittish"),
    );
    expect(signedDecisionScore("skittish", "collision-flee", 0)).toBeGreaterThan(
      signedDecisionScore("reserved", "collision-flee", 0),
    );
  });

  it("assigns distinct user-distance signatures to attentive, reserved, and aloof", () => {
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.attentive.primaryDecision).toBe("keep-watch");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.reserved.primaryDecision).toBe("peek");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.aloof.primaryDecision).toBe("withdraw");
  });

  it("gives every catalog entry a distinct second signature beat", () => {
    const secondaries = Object.values(PERSONALITY_BEHAVIOR_SIGNATURES).map(
      (signature) => signature.secondaryDecision,
    );
    // Every preset carries a second signature that is not its first, and no two
    // presets share the same second beat — two exclusive silhouettes each.
    for (const signature of Object.values(PERSONALITY_BEHAVIOR_SIGNATURES)) {
      expect(signature.secondaryDecision).not.toBe(signature.primaryDecision);
    }
    expect(new Set(secondaries).size).toBe(secondaries.length);
  });

  it("biases each personality toward its own second signature", () => {
    expect(signedDecisionScore("lazy", "lounge", 0)).toBeGreaterThan(
      signedDecisionScore("playful", "lounge", 0),
    );
    expect(signedDecisionScore("shrewd", "appraise", 0)).toBeGreaterThan(
      signedDecisionScore("gentle", "appraise", 0),
    );
    expect(signedDecisionScore("feisty", "posture", 0)).toBeGreaterThan(
      signedDecisionScore("reserved", "posture", 0),
    );
  });

  it("gives every remaining catalog entry an exclusive primary action", () => {
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.playful.primaryDecision).toBe("play-romp");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.curious.primaryDecision).toBe("inspect");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.steady.primaryDecision).toBe("follow-routine");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.feisty.primaryDecision).toBe("strut");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.gentle.primaryDecision).toBe("offer-comfort");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.skittish.primaryDecision).toBe("stand-lookout");
    expect(PERSONALITY_BEHAVIOR_SIGNATURES.shrewd.primaryDecision).toBe("observe");
  });

  it("distinguishes calm personalities by social and solo signatures", () => {
    expect(signedDecisionScore("gentle", "greet", 0)).toBeGreaterThan(
      signedDecisionScore("zen", "greet", 0),
    );
    expect(signedDecisionScore("steady", "groom", 0)).toBeGreaterThan(
      signedDecisionScore("gentle", "groom", 0),
    );
    expect(signedDecisionScore("zen", "collision-unfazed", 0)).toBeGreaterThan(
      signedDecisionScore("steady", "collision-unfazed", 0),
    );
  });

  it("gives playful pairs chase sessions and gentle pairs greetings", () => {
    expect(strongestSocialKind("playful", "playful")).toBe("chase");
    expect(strongestSocialKind("gentle", "gentle")).toBe("greet");
  });

  it("makes lively pairs more inclined to dance than low-energy pairs", () => {
    const danceWeight = (id: PetPersonalityId) =>
      socialSessionKindWeights(personality(id), personality(id)).find(
        ({ kind }) => kind === "dance",
      )?.weight ?? 0;

    expect(danceWeight("playful")).toBeGreaterThan(danceWeight("lazy"));
    expect(danceWeight("feisty")).toBeGreaterThan(danceWeight("aloof"));
  });

  it("keeps dance visible across the catalog without flattening personality differences", () => {
    let danceShare = 0;
    let pairCount = 0;
    for (const left of PERSONALITY_REGISTRY) {
      for (const right of PERSONALITY_REGISTRY) {
        const weights = socialSessionKindWeights(personality(left.id), personality(right.id));
        const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
        danceShare += weights.find(({ kind }) => kind === "dance")!.weight / total;
        pairCount += 1;
      }
    }

    expect(danceShare / pairCount).toBeGreaterThanOrEqual(0.25);
    expect(danceShare / pairCount).toBeLessThan(0.35);
  });

  it("preserves neutral behavior for personality components without a catalog id", () => {
    expect(signedDecisionScore(undefined, "play-romp", 0.42)).toBe(0.42);
    expect(personalityIdleDurationScale(undefined)).toBe(1);
    expect(personalityArrivalDwellScale(undefined)).toBe(1);
  });
});
