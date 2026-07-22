import {
  createAloofPersonality,
  createAttentivePersonality,
  createCuriousPersonality,
  createFeistyPersonality,
  createGentlePersonality,
  createLazyPersonality,
  createMischievousPersonality,
  createPlayfulPersonality,
  createReservedPersonality,
  createShrewdPersonality,
  createSkittishPersonality,
  createSteadyPersonality,
  createZenPersonality,
} from "@pets-driven/pet-engine/pets/personalities/factories";
import { describe, expect, it } from "vitest";

describe("personality factories — OCEAN axes", () => {
  it("playful has extreme extraversion, low neuroticism", () => {
    const p = createPlayfulPersonality();
    expect(p.extraversion).toBe(0.95);
    expect(p.openness).toBe(0.75);
    expect(p.neuroticism).toBe(0.08);
    expect(p.agreeableness).toBe(0.55);
    expect(p.conscientiousness).toBe(0.3);
  });

  it("attentive has high extraversion and extreme agreeableness, low openness", () => {
    const p = createAttentivePersonality();
    expect(p.extraversion).toBeGreaterThan(0.7);
    expect(p.agreeableness).toBeGreaterThan(0.9);
    expect(p.conscientiousness).toBeGreaterThan(0.5);
    expect(p.openness).toBe(0.25);
    expect(p.neuroticism).toBe(0.15);
  });

  it("reserved has high neuroticism and very low extraversion", () => {
    const p = createReservedPersonality();
    expect(p.neuroticism).toBeGreaterThan(0.8);
    expect(p.extraversion).toBeLessThan(0.15);
    expect(p.openness).toBe(0.22);
    expect(p.agreeableness).toBe(0.38);
  });

  it("curious has extreme openness and moderate sociability", () => {
    const p = createCuriousPersonality();
    expect(p.openness).toBe(0.98);
    expect(p.extraversion).toBe(0.45);
    expect(p.conscientiousness).toBe(0.35);
    expect(p.neuroticism).toBe(0.3);
  });

  it("steady has extreme conscientiousness and very low neuroticism", () => {
    const p = createSteadyPersonality();
    expect(p.conscientiousness).toBe(0.95);
    expect(p.neuroticism).toBe(0.06);
    expect(p.extraversion).toBe(0.4);
    expect(p.completionIntent).toBe("stand");
  });

  it("feisty has high extraversion, low agreeableness and elevated neuroticism", () => {
    const p = createFeistyPersonality();
    expect(p.extraversion).toBeGreaterThanOrEqual(0.85);
    expect(p.agreeableness).toBeLessThan(0.35);
    expect(p.neuroticism).toBeGreaterThan(0.5);
    expect(p.neuroticism).toBeLessThan(0.8);
    expect(p.completionIntent).toBe("arrive");
  });

  it("gentle has extreme agreeableness and low neuroticism", () => {
    const p = createGentlePersonality();
    expect(p.agreeableness).toBe(0.98);
    expect(p.neuroticism).toBe(0.12);
    expect(p.extraversion).toBe(0.3);
    expect(p.completionIntent).toBe("arrive");
  });

  it("mischievous has high openness/extraversion with extreme low conscientiousness", () => {
    const p = createMischievousPersonality();
    expect(p.openness).toBe(0.9);
    expect(p.extraversion).toBe(0.82);
    expect(p.conscientiousness).toBe(0.1);
    expect(p.agreeableness).toBe(0.32);
    expect(p.completionIntent).toBe("arrive");
  });

  it("lazy has very low extraversion and conscientiousness", () => {
    const p = createLazyPersonality();
    expect(p.extraversion).toBe(0.1);
    expect(p.conscientiousness).toBe(0.18);
    expect(p.completionIntent).toBe("stand");
  });

  it("zen has the lowest neuroticism and warm, balanced traits", () => {
    const p = createZenPersonality();
    expect(p.neuroticism).toBe(0.02);
    expect(p.agreeableness).toBeGreaterThan(0.7);
    expect(p.completionIntent).toBe("stand");
  });

  it("aloof has extreme low agreeableness and low extraversion", () => {
    const p = createAloofPersonality();
    expect(p.agreeableness).toBeLessThan(0.1);
    expect(p.extraversion).toBeLessThan(0.2);
    expect(p.completionIntent).toBe("stand");
  });

  it("skittish has extreme neuroticism", () => {
    const p = createSkittishPersonality();
    expect(p.neuroticism).toBeGreaterThan(0.9);
    expect(p.extraversion).toBeLessThan(0.3);
    expect(p.completionIntent).toBe("stand");
  });

  it("shrewd pairs high openness and conscientiousness with low agreeableness and cool nerves", () => {
    const p = createShrewdPersonality();
    expect(p.openness).toBeGreaterThanOrEqual(0.85);
    expect(p.conscientiousness).toBeGreaterThan(0.8);
    expect(p.agreeableness).toBeLessThan(0.3);
    expect(p.neuroticism).toBeLessThan(0.15);
    expect(p.completionIntent).toBe("stand");
  });

  it("all factories return all five OCEAN axes as numbers", () => {
    for (const factory of [
      createPlayfulPersonality,
      createAttentivePersonality,
      createReservedPersonality,
      createCuriousPersonality,
      createSteadyPersonality,
      createFeistyPersonality,
      createGentlePersonality,
      createMischievousPersonality,
      createLazyPersonality,
      createZenPersonality,
      createAloofPersonality,
      createSkittishPersonality,
      createShrewdPersonality,
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
