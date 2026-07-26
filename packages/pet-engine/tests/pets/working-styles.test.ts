import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import {
  MIN_WORKING_BEHAVIOR_HOLD_MS,
  PERSONALITY_WORKING_STYLES,
  workingBehaviorHoldMs,
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

describe("working styles", () => {
  it("covers every catalog personality with valid decision scores", () => {
    for (const entry of PERSONALITY_REGISTRY) {
      const style = PERSONALITY_WORKING_STYLES[entry.id];
      expect(style).toBeDefined();
      expect(style.focusScore).toBeGreaterThan(0);
      expect(style.reviewScore).toBeGreaterThan(0);
      expect(style.paceScore).toBeGreaterThan(0);
    }
  });

  it("derives character from traits for custom pets", () => {
    const diligent = workingStyle(
      personality({ conscientiousness: 0.9, neuroticism: 0.1, extraversion: 0.2 }),
    );
    const restless = workingStyle(
      personality({ conscientiousness: 0.2, neuroticism: 0.7, extraversion: 0.9 }),
    );

    expect(diligent.focusScore).toBeGreaterThan(restless.focusScore);
    expect(restless.paceScore).toBeGreaterThan(diligent.paceScore);
    expect(diligent.holdMs).toBeGreaterThan(restless.holdMs);
  });

  it("never lets jitter shorten a work behavior below the visual threshold", () => {
    for (const style of Object.values(PERSONALITY_WORKING_STYLES)) {
      expect(workingBehaviorHoldMs(style, 0)).toBeGreaterThanOrEqual(MIN_WORKING_BEHAVIOR_HOLD_MS);
    }
  });
});
