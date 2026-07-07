import { describe, expect, it } from "vitest";
import {
  createPlayfulPersonality,
  createAttentivePersonality,
  createReservedPersonality,
  createCuriousPersonality,
  createSteadyPersonality,
  createBoldPersonality,
  createGentlePersonality,
  createMischievousPersonality,
  createLazyPersonality,
  createZenPersonality,
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

  it("curious has very high openness and moderate sociability", () => {
    const p = createCuriousPersonality();
    expect(p.openness).toBe(0.9);
    expect(p.extraversion).toBe(0.55);
    expect(p.conscientiousness).toBe(0.35);
    expect(p.neuroticism).toBe(0.25);
  });

  it("steady has high conscientiousness and low neuroticism", () => {
    const p = createSteadyPersonality();
    expect(p.conscientiousness).toBe(0.85);
    expect(p.neuroticism).toBe(0.15);
    expect(p.extraversion).toBe(0.45);
    expect(p.completionIntent).toBe("stand");
  });

  it("bold has high openness and extraversion with low neuroticism", () => {
    const p = createBoldPersonality();
    expect(p.openness).toBe(0.8);
    expect(p.extraversion).toBe(0.9);
    expect(p.neuroticism).toBe(0.12);
    expect(p.completionIntent).toBe("arrive");
  });

  it("gentle has very high agreeableness and low neuroticism", () => {
    const p = createGentlePersonality();
    expect(p.agreeableness).toBe(0.9);
    expect(p.neuroticism).toBe(0.15);
    expect(p.extraversion).toBe(0.4);
    expect(p.completionIntent).toBe("arrive");
  });

  it("mischievous has high openness and extraversion with low conscientiousness", () => {
    const p = createMischievousPersonality();
    expect(p.openness).toBe(0.85);
    expect(p.extraversion).toBe(0.8);
    expect(p.conscientiousness).toBe(0.2);
    expect(p.completionIntent).toBe("arrive");
  });

  it("lazy has very low extraversion and conscientiousness", () => {
    const p = createLazyPersonality();
    expect(p.extraversion).toBe(0.15);
    expect(p.conscientiousness).toBe(0.25);
    expect(p.completionIntent).toBe("stand");
  });

  it("zen has very low neuroticism and balanced traits", () => {
    const p = createZenPersonality();
    expect(p.neuroticism).toBe(0.05);
    expect(p.agreeableness).toBeGreaterThan(0.7);
    expect(p.completionIntent).toBe("stand");
  });

  it("all factories return all five OCEAN axes as numbers", () => {
    for (const factory of [
      createPlayfulPersonality,
      createAttentivePersonality,
      createReservedPersonality,
      createCuriousPersonality,
      createSteadyPersonality,
      createBoldPersonality,
      createGentlePersonality,
      createMischievousPersonality,
      createLazyPersonality,
      createZenPersonality,
    ]) {
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
