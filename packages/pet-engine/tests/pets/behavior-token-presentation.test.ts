import type { PetExpressionSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { presentPetExpression } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import { describe, expect, it } from "vitest";

function expressionFixture(overrides: Partial<PetExpressionSnapshot> = {}): PetExpressionSnapshot {
  return {
    source: "collision",
    mood: "confused",
    emote: "exclaim",
    label: "!",
    startedAt: 120,
    expiresAt: 820,
    ...overrides,
  };
}

describe("behavior token presentation", () => {
  it("does not present a missing pet expression", () => {
    expect(presentPetExpression(null)).toBeNull();
  });

  it("does not present pet expressions with no emote", () => {
    expect(presentPetExpression(expressionFixture({ emote: "none" }))).toBeNull();
  });

  it("uses a fallback label when an expression label is absent", () => {
    expect(presentPetExpression(expressionFixture({ label: null }))).toEqual({
      emote: "exclaim",
      label: "Pet expression",
      mood: "confused",
      tone: "alert",
    });
  });

  it("presents non-null expression labels", () => {
    expect(presentPetExpression(expressionFixture({ label: "!" }))).toEqual({
      emote: "exclaim",
      label: "!",
      mood: "confused",
      tone: "alert",
    });
  });
});
