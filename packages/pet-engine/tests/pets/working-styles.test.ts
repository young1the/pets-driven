import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import {
  isWorkingReason,
  jitteredFocusHoldMs,
  PERSONALITY_WORKING_STYLES,
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
