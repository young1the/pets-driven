import { describe, expect, it } from "vitest";
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

function personality(catalogId: PetPersonalityId): PersonalityComponent {
  const factory = PERSONALITY_REGISTRY.find((entry) => entry.id === catalogId)?.factory;
  if (!factory) throw new Error(`Missing personality factory for ${catalogId}`);
  const { openness, conscientiousness, extraversion, agreeableness, neuroticism } =
    factory();
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
      PERSONALITY_BEHAVIOR_SIGNATURES.bold.primaryDecision,
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

  it("turns playful toward romping while bold favors unfazed collisions", () => {
    expect(signedDecisionScore("playful", "play-romp", 0)).toBeGreaterThan(
      signedDecisionScore("bold", "play-romp", 0),
    );
    expect(
      signedDecisionScore("bold", "collision-unfazed", 0),
    ).toBeGreaterThan(
      signedDecisionScore("playful", "collision-unfazed", 0),
    );
  });

  it("makes reserved settle while skittish keeps short, flighty beats", () => {
    expect(personalityIdleDurationScale("reserved")).toBeGreaterThan(
      personalityIdleDurationScale("skittish"),
    );
    expect(personalityArrivalDwellScale("reserved")).toBeGreaterThan(
      personalityArrivalDwellScale("skittish"),
    );
    expect(
      signedDecisionScore("skittish", "collision-flee", 0),
    ).toBeGreaterThan(
      signedDecisionScore("reserved", "collision-flee", 0),
    );
  });

  it("distinguishes calm personalities by social and solo signatures", () => {
    expect(signedDecisionScore("gentle", "greet", 0)).toBeGreaterThan(
      signedDecisionScore("zen", "greet", 0),
    );
    expect(signedDecisionScore("steady", "groom", 0)).toBeGreaterThan(
      signedDecisionScore("gentle", "groom", 0),
    );
    expect(
      signedDecisionScore("zen", "collision-unfazed", 0),
    ).toBeGreaterThan(
      signedDecisionScore("steady", "collision-unfazed", 0),
    );
  });

  it("gives playful pairs chase sessions and gentle pairs greetings", () => {
    expect(strongestSocialKind("playful", "playful")).toBe("chase");
    expect(strongestSocialKind("gentle", "gentle")).toBe("greet");
  });

  it("preserves neutral behavior for personality components without a catalog id", () => {
    expect(signedDecisionScore(undefined, "play-romp", 0.42)).toBe(0.42);
    expect(personalityIdleDurationScale(undefined)).toBe(1);
    expect(personalityArrivalDwellScale(undefined)).toBe(1);
  });
});
