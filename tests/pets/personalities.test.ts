import { describe, expect, it } from "vitest";
import {
  createPlayfulPersonality,
  createAttentivePersonality,
  createReservedPersonality,
} from "@/pets/personalities/factories";

describe("personality factories — BehaviorPreference axes", () => {
  it("playful has high playfulness and curiosity", () => {
    const p = createPlayfulPersonality();
    expect(p.curiosity).toBe(0.7);
    expect(p.sociability).toBe(0.4);
    expect(p.playfulness).toBe(0.9);
    expect(p.shyness).toBe(0.1);
  });

  it("attentive has high sociability and low playfulness", () => {
    const p = createAttentivePersonality();
    expect(p.sociability).toBeGreaterThan(0.7);
    expect(p.playfulness).toBeLessThan(0.5);
    expect(p.curiosity).toBe(0.3);
    expect(p.shyness).toBe(0.2);
  });

  it("reserved has high shyness and low playfulness", () => {
    const p = createReservedPersonality();
    expect(p.shyness).toBeGreaterThan(0.6);
    expect(p.playfulness).toBeLessThan(0.3);
    expect(p.curiosity).toBe(0.2);
    expect(p.sociability).toBe(0.2);
  });

  it("all factories return plain objects with all four axes", () => {
    for (const factory of [createPlayfulPersonality, createAttentivePersonality, createReservedPersonality]) {
      const p = factory();
      expect(typeof p.curiosity).toBe("number");
      expect(typeof p.sociability).toBe("number");
      expect(typeof p.playfulness).toBe("number");
      expect(typeof p.shyness).toBe("number");
      expect(Array.isArray(p)).toBe(false);
    }
  });
});
