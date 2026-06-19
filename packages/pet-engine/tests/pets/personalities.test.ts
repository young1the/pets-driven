import { describe, expect, it } from "vitest";
import {
  createPlayfulPersonality,
  createAttentivePersonality,
  createReservedPersonality,
} from "@pets-driven/pet-engine/pets/personalities/factories";

describe("personality factories — OCEAN axes", () => {
  it("playful has high extraversion and openness, low neuroticism", () => {
    const p = createPlayfulPersonality();
    expect(p.extraversion).toBe(0.85);
    expect(p.openness).toBe(0.7);
    expect(p.neuroticism).toBe(0.1);
    expect(p.agreeableness).toBe(0.5);
    expect(p.conscientiousness).toBe(0.4);
  });

  it("attentive has high extraversion and agreeableness", () => {
    const p = createAttentivePersonality();
    expect(p.extraversion).toBeGreaterThan(0.7);
    expect(p.agreeableness).toBeGreaterThan(0.7);
    expect(p.conscientiousness).toBeGreaterThan(0.5);
    expect(p.openness).toBe(0.3);
    expect(p.neuroticism).toBe(0.2);
  });

  it("reserved has high neuroticism and low extraversion", () => {
    const p = createReservedPersonality();
    expect(p.neuroticism).toBeGreaterThan(0.6);
    expect(p.extraversion).toBeLessThan(0.3);
    expect(p.openness).toBe(0.3);
    expect(p.agreeableness).toBe(0.4);
  });

  it("all factories return all five OCEAN axes as numbers", () => {
    for (const factory of [createPlayfulPersonality, createAttentivePersonality, createReservedPersonality]) {
      const p = factory();
      expect(typeof p.openness).toBe("number");
      expect(typeof p.conscientiousness).toBe("number");
      expect(typeof p.extraversion).toBe("number");
      expect(typeof p.agreeableness).toBe("number");
      expect(typeof p.neuroticism).toBe("number");
      expect(Array.isArray(p)).toBe(false);
    }
  });
});
