import { describe, expect, it } from "vitest";
import { wanderRadius } from "@pets-driven/pet-engine/features/behavior/systems";
import type { PersonalityComponent } from "@pets-driven/pet-engine/core/components";

function p(overrides: Partial<Omit<PersonalityComponent, "type">> = {}): PersonalityComponent {
  return {
    type: "Personality",
    openness: 0.5,
    conscientiousness: 0.4,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.2,
    ...overrides,
  };
}

describe("wanderRadius — near", () => {
  it("N=0 → [96, 216] from the 3x body-width base", () => {
    const [min, max] = wanderRadius(p({ neuroticism: 0.0 }), "near");
    expect(min).toBe(96);
    expect(max).toBe(216);
  });

  it("N=1 → [136, 176] (narrower but still meaningful)", () => {
    const [min, max] = wanderRadius(p({ neuroticism: 1.0 }), "near");
    expect(min).toBe(136);
    expect(max).toBe(176);
  });

  it("high-N max < low-N max (tighter circle for anxious pets)", () => {
    const [, highNMax] = wanderRadius(p({ neuroticism: 0.9 }), "near");
    const [, lowNMax]  = wanderRadius(p({ neuroticism: 0.1 }), "near");
    expect(highNMax).toBeLessThan(lowNMax);
  });

  it("min increases monotonically with N", () => {
    const [min0] = wanderRadius(p({ neuroticism: 0.0 }), "near");
    const [min5] = wanderRadius(p({ neuroticism: 0.5 }), "near");
    const [min9] = wanderRadius(p({ neuroticism: 0.9 }), "near");
    expect(min0).toBeLessThan(min5);
    expect(min5).toBeLessThan(min9);
  });

  it("range width is at least 40 even at high N (visible movement guaranteed)", () => {
    const [min, max] = wanderRadius(p({ neuroticism: 1.0 }), "near");
    expect(max - min).toBeGreaterThanOrEqual(40);
  });

  it("scales from pet body width", () => {
    const [defaultMin, defaultMax] = wanderRadius(p({ neuroticism: 0.0 }), "near", 32);
    const [largeMin, largeMax] = wanderRadius(p({ neuroticism: 0.0 }), "near", 64);

    expect(largeMin).toBe(defaultMin * 2);
    expect(largeMax).toBe(defaultMax * 2);
  });
});

describe("wanderRadius — far", () => {
  it("O=0 → [192, 384] from the 3x body-width base", () => {
    const [min, max] = wanderRadius(p({ openness: 0.0 }), "far");
    expect(min).toBe(192);
    expect(max).toBe(384);
  });

  it("O=1 → [288, 576] (extended range for curious pets)", () => {
    const [min, max] = wanderRadius(p({ openness: 1.0 }), "far");
    expect(min).toBe(288);
    expect(max).toBe(576);
  });

  it("high-O max > low-O max (curious pets explore further)", () => {
    const [, highOMax] = wanderRadius(p({ openness: 0.9 }), "far");
    const [, lowOMax]  = wanderRadius(p({ openness: 0.1 }), "far");
    expect(highOMax).toBeGreaterThan(lowOMax);
  });

  it("neuroticism does NOT affect far range", () => {
    const [min0, max0] = wanderRadius(p({ openness: 0.5, neuroticism: 0.0 }), "far");
    const [min9, max9] = wanderRadius(p({ openness: 0.5, neuroticism: 0.9 }), "far");
    expect(min0).toBe(min9);
    expect(max0).toBe(max9);
  });

  it("scales from pet body width", () => {
    const [defaultMin, defaultMax] = wanderRadius(p({ openness: 1.0 }), "far", 32);
    const [largeMin, largeMax] = wanderRadius(p({ openness: 1.0 }), "far", 64);

    expect(largeMin).toBe(defaultMin * 2);
    expect(largeMax).toBe(defaultMax * 2);
  });
});
