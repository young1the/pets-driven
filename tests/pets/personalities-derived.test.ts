import { describe, expect, it } from "vitest";
import {
  createFixturePet,
  deriveMovementProfile,
  deriveIdleConversation,
} from "@/core/scenario-fixtures";
import type {
  PersonalityComponent,
  MovementProfileComponent,
  IdleConversationComponent,
} from "@/core/components";

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/** Last component of given type in the array (ECS last-write-wins semantics). */
function last<T extends { type: string }>(
  components: { type: string }[],
  type: T["type"],
): T | undefined {
  return [...components].reverse().find((c) => c.type === type) as T | undefined;
}

function buildPet(extra: SimulationComponentLike[]) {
  return createFixturePet({
    id: "test-pet",
    sourceId: "agent-test",
    name: "Test",
    x: 0,
    y: 0,
    components: extra as never,
  });
}

// Loose type so we can pass plain objects in tests without full union types.
type SimulationComponentLike = { type: string; [key: string]: unknown };

// ─── deriveMovementProfile ────────────────────────────────────────────────────

describe("deriveMovementProfile", () => {
  it("high-E speeds exceed low-E speeds (same N)", () => {
    const highE = deriveMovementProfile(p({ extraversion: 0.9, neuroticism: 0.1 }));
    const lowE  = deriveMovementProfile(p({ extraversion: 0.1, neuroticism: 0.1 }));
    expect(highE.activeSpeed).toBeGreaterThan(lowE.activeSpeed);
    expect(highE.idleSpeed).toBeGreaterThan(lowE.idleSpeed);
    expect(highE.seekSpeed).toBeGreaterThan(lowE.seekSpeed);
  });

  it("high-N speeds are slower than low-N (same E)", () => {
    const highN = deriveMovementProfile(p({ extraversion: 0.5, neuroticism: 0.9 }));
    const lowN  = deriveMovementProfile(p({ extraversion: 0.5, neuroticism: 0.0 }));
    expect(highN.activeSpeed).toBeLessThan(lowN.activeSpeed);
  });

  it("exact values for E=0.9, N=0.1 — energy = 0.6 + 0.9×0.5 − 0.1×0.2 = 1.03", () => {
    const energy = 0.6 + 0.9 * 0.5 - 0.1 * 0.2;        // 1.03
    const mp = deriveMovementProfile(p({ extraversion: 0.9, neuroticism: 0.1 }));
    expect(mp.idleSpeed).toBeCloseTo(0.0005 * energy, 10);
    expect(mp.activeSpeed).toBeCloseTo(0.0012 * energy, 10);
    expect(mp.seekSpeed).toBeCloseTo(0.0018 * energy, 10);
  });

  it("returns a MovementProfile component type tag", () => {
    expect(deriveMovementProfile(p()).type).toBe("MovementProfile");
  });
});

// ─── deriveIdleConversation ───────────────────────────────────────────────────

describe("deriveIdleConversation", () => {
  it("high-E produces shorter interval (more talkative)", () => {
    const highE = deriveIdleConversation(p({ extraversion: 0.9 }));
    const lowE  = deriveIdleConversation(p({ extraversion: 0.1 }));
    expect(highE.idleAfterMs).toBeLessThan(lowE.idleAfterMs);
  });

  it("E=0.9 → 4100 ms  (14000 − 0.9×11000)", () => {
    expect(deriveIdleConversation(p({ extraversion: 0.9 })).idleAfterMs).toBe(4100);
  });

  it("E=0.1 → 12900 ms  (14000 − 0.1×11000)", () => {
    expect(deriveIdleConversation(p({ extraversion: 0.1 })).idleAfterMs).toBe(12900);
  });

  it("returns an IdleConversation component type tag", () => {
    expect(deriveIdleConversation(p()).type).toBe("IdleConversation");
  });
});

// ─── createFixturePet — derived component attachment ─────────────────────────

describe("createFixturePet — Personality-derived components", () => {
  it("pet with no explicit MovementProfile gets one derived from Personality", () => {
    const { components } = buildPet([p({ extraversion: 0.9, neuroticism: 0.1 })]);
    const mp = last<MovementProfileComponent>(components, "MovementProfile");
    // energy = 0.6 + 0.9×0.5 − 0.1×0.2 = 1.03
    const energy = 0.6 + 0.9 * 0.5 - 0.1 * 0.2;
    expect(mp).toBeDefined();
    expect(mp!.activeSpeed).toBeCloseTo(0.0012 * energy, 10);
  });

  it("explicit MovementProfile in input.components wins over derivation", () => {
    const { components } = buildPet([
      p({ extraversion: 0.9 }),
      { type: "MovementProfile", idleSpeed: 0.001, activeSpeed: 0.002, seekSpeed: 0.003 },
    ]);
    const mp = last<MovementProfileComponent>(components, "MovementProfile");
    expect(mp!.idleSpeed).toBe(0.001);
    expect(mp!.activeSpeed).toBe(0.002);
    expect(mp!.seekSpeed).toBe(0.003);
  });

  it("pet with no explicit IdleConversation gets one derived from Personality", () => {
    const { components } = buildPet([p({ extraversion: 0.9 })]);
    const ic = last<IdleConversationComponent>(components, "IdleConversation");
    // E=0.9 → 14000 − 0.9×11000 = 4100
    expect(ic).toBeDefined();
    expect(ic!.idleAfterMs).toBe(4100);
  });

  it("explicit IdleConversation in input.components wins over derivation", () => {
    const { components } = buildPet([
      p({ extraversion: 0.9 }),
      { type: "IdleConversation", idleAfterMs: 5_000 },
    ]);
    const ic = last<IdleConversationComponent>(components, "IdleConversation");
    expect(ic!.idleAfterMs).toBe(5_000);
  });

  it("default Personality (no override) produces mid-range speeds", () => {
    // Default: E=0.5, N=0.2 → energy = 0.6 + 0.5×0.5 − 0.2×0.2 = 0.81
    const { components } = buildPet([]);
    const mp = last<MovementProfileComponent>(components, "MovementProfile");
    const energy = 0.6 + 0.5 * 0.5 - 0.2 * 0.2;        // 0.81
    expect(mp).toBeDefined();
    expect(mp!.activeSpeed).toBeCloseTo(0.0012 * energy, 10);
  });

  it("exactly one MovementProfile component per pet (no double-attach)", () => {
    const { components } = buildPet([p({ extraversion: 0.5 })]);
    expect(components.filter((c) => c.type === "MovementProfile")).toHaveLength(1);
  });

  it("exactly one IdleConversation component per pet (no double-attach)", () => {
    const { components } = buildPet([p({ extraversion: 0.5 })]);
    expect(components.filter((c) => c.type === "IdleConversation")).toHaveLength(1);
  });

  it("exactly one IdleConversation when explicit override present (no double-attach)", () => {
    const { components } = buildPet([
      p({ extraversion: 0.5 }),
      { type: "IdleConversation", idleAfterMs: 3_000 },
    ]);
    expect(components.filter((c) => c.type === "IdleConversation")).toHaveLength(1);
  });
});
