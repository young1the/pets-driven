import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import {
  isWorkingReason,
  jitteredFocusHoldMs,
  PERSONALITY_WORKING_STYLES,
  resolveWorkingPose,
  WORKING_FOCUS_REASONS,
  workingStyle,
} from "@pets-driven/pet-engine/pets/personalities/working-styles";
import { describe, expect, it } from "vitest";

function personality(overrides: Partial<PersonalityComponent> = {}): PersonalityComponent {
  return {
    type: "Personality",
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.3,
    ...overrides,
  };
}

describe("PERSONALITY_WORKING_STYLES", () => {
  it("covers every catalog personality", () => {
    for (const entry of PERSONALITY_REGISTRY) {
      expect(PERSONALITY_WORKING_STYLES[entry.id]).toBeDefined();
    }
  });

  it("spreads the catalog across every working pose", () => {
    const used = new Set(
      Object.values(PERSONALITY_WORKING_STYLES).map((style) => style.focusReason),
    );
    expect(used).toEqual(new Set(WORKING_FOCUS_REASONS));
  });

  it("keeps every pet mostly working — pacing is the minority beat", () => {
    for (const style of Object.values(PERSONALITY_WORKING_STYLES)) {
      expect(style.paceChance).toBeGreaterThan(0);
      expect(style.paceChance).toBeLessThan(0.6);
    }
  });

  /**
   * Both signals — what the agent is doing and who the pet is — have to survive
   * in the same body: no personality mirrors the agent every single beat, and
   * none ignores it entirely.
   */
  it("leaves room for both the agent's work and the pet's own character", () => {
    for (const style of Object.values(PERSONALITY_WORKING_STYLES)) {
      expect(style.toolFollow).toBeGreaterThanOrEqual(0.3);
      expect(style.toolFollow).toBeLessThanOrEqual(0.9);
    }
    expect(PERSONALITY_WORKING_STYLES.steady.toolFollow).toBeGreaterThan(
      PERSONALITY_WORKING_STYLES.lazy.toolFollow,
    );
  });
});

describe("resolveWorkingPose", () => {
  const style = PERSONALITY_WORKING_STYLES.steady; // own pose: working-focus, follow 0.9

  it("acts out the agent's work when the roll falls inside toolFollow", () => {
    expect(resolveWorkingPose(style, "working-tinker", 0.1)).toBe("working-tinker");
  });

  it("keeps its own pose when the roll falls outside", () => {
    expect(resolveWorkingPose(style, "working-tinker", 0.95)).toBe("working-focus");
  });

  /** No usable tool (Codex, or a stale pulse) is a normal state, not a gap. */
  it("keeps its own pose when there is no tool work to act out", () => {
    expect(resolveWorkingPose(style, null, 0)).toBe("working-focus");
  });
});

describe("workingStyle", () => {
  it("uses the catalog entry when the pet has a catalog identity", () => {
    expect(workingStyle(personality({ catalogId: "lazy" }))).toEqual(
      PERSONALITY_WORKING_STYLES.lazy,
    );
  });

  // Custom personalities and older saved state carry no catalogId, so the raw
  // OCEAN traits still have to produce a characterful hold.
  it.each([
    [{ neuroticism: 0.8 }, "working-fuss"],
    [{ conscientiousness: 0.8 }, "working-focus"],
    [{ conscientiousness: 0.2, extraversion: 0.2 }, "working-loaf"],
    [{ conscientiousness: 0.4, openness: 0.8 }, "working-tinker"],
    [{ conscientiousness: 0.4, openness: 0.2 }, "working-ponder"],
  ] as const)("derives a pose from traits when uncatalogued (%o)", (traits, expected) => {
    expect(workingStyle(personality(traits)).focusReason).toBe(expected);
  });

  it("gives a conscientious pet a longer hold than an anxious one", () => {
    const diligent = workingStyle(personality({ conscientiousness: 0.9, neuroticism: 0.1 }));
    const anxious = workingStyle(personality({ conscientiousness: 0.2, neuroticism: 0.9 }));
    expect(diligent.focusHoldMs).toBeGreaterThan(anxious.focusHoldMs);
    expect(anxious.paceChance).toBeGreaterThan(diligent.paceChance);
  });
});

describe("jitteredFocusHoldMs", () => {
  it("varies the hold around the style's base without inverting it", () => {
    const style = PERSONALITY_WORKING_STYLES.steady;
    expect(jitteredFocusHoldMs(style, 0)).toBeLessThan(style.focusHoldMs);
    expect(jitteredFocusHoldMs(style, 0.5)).toBe(style.focusHoldMs);
    expect(jitteredFocusHoldMs(style, 1)).toBeGreaterThan(style.focusHoldMs);
    expect(jitteredFocusHoldMs(style, 0)).toBeGreaterThan(style.focusHoldMs * 0.5);
  });
});

describe("isWorkingReason", () => {
  it("recognizes the pacing beat and every focus pose", () => {
    expect(isWorkingReason("working-wander")).toBe(true);
    for (const reason of WORKING_FOCUS_REASONS) {
      expect(isWorkingReason(reason)).toBe(true);
    }
    expect(isWorkingReason("wander-near")).toBe(false);
  });
});
