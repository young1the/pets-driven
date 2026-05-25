import { describe, expect, it } from "vitest";
import { wanderRadius } from "@/features/behavior/systems";
import type { PersonalityComponent } from "@/core/components";

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
  it("N=0 → [60, 140] (widest range)", () => {
    const [min, max] = wanderRadius(p({ neuroticism: 0.0 }), "near");
    expect(min).toBe(60);
    expect(max).toBe(140);
  });

  it("N=1 → [80, 80] (collapsed range — pet stays very close)", () => {
    const [min, max] = wanderRadius(p({ neuroticism: 1.0 }), "near");
    expect(min).toBe(80);  // 60 + 1.0*20
    expect(max).toBe(80);  // 140 - 1.0*60
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
});

describe("wanderRadius — far", () => {
  it("O=0 → [200, 400] (standard range)", () => {
    const [min, max] = wanderRadius(p({ openness: 0.0 }), "far");
    expect(min).toBe(200);
    expect(max).toBe(400);
  });

  it("O=1 → [300, 600] (extended range for curious pets)", () => {
    const [min, max] = wanderRadius(p({ openness: 1.0 }), "far");
    expect(min).toBe(300);  // 200 + 1.0*100
    expect(max).toBe(600);  // 400 + 1.0*200
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
});
