import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import {
  DANCE_BEAT_MS,
  danceStepOffsets,
  isDanceFlourish,
} from "@pets-driven/pet-engine/features/social/dance";
import { describe, expect, it } from "vitest";

describe("dance choreography", () => {
  it("produces a clearly visible stage-opening movement in the live world", () => {
    const personality = {
      type: "Personality" as const,
      catalogId: "playful" as const,
      openness: 0.75,
      conscientiousness: 0.3,
      extraversion: 0.95,
      agreeableness: 0.55,
      neuroticism: 0.08,
    };
    const scenario = createAdoptedPetsScenario([
      { id: "pet-a", sourceId: "agent-a", name: "A", personality },
      { id: "pet-b", sourceId: "agent-b", name: "B", personality },
    ]);
    scenario.world.setPhysicsPosition("pet-a", { x: 100 });
    scenario.world.setPhysicsPosition("pet-b", { x: 160 });
    scenario.world.addEntity({
      id: "dance-session",
      components: [
        {
          type: "SocialSession",
          kind: "dance",
          participantIds: ["pet-a", "pet-b"],
          phase: "play",
          startedAt: 0,
          endsAt: 8_800,
          playStartedAt: 0,
          greeted: false,
        },
      ],
    });
    scenario.world.setComponent("pet-a", {
      type: "SocialSessionMember",
      sessionId: "dance-session",
      partnerId: "pet-b",
      role: "initiator",
    });
    scenario.world.setComponent("pet-b", {
      type: "SocialSessionMember",
      sessionId: "dance-session",
      partnerId: "pet-a",
      role: "responder",
    });

    const startGap = 60;
    for (let elapsed = 0; elapsed < DANCE_BEAT_MS - 20; elapsed += 16) {
      scenario.clock.advanceBy(16);
      scenario.world.step(16);
    }
    const pets = scenario.world.snapshot().pets;
    const stageLeadX = pets.find(({ id }) => id === "pet-a")!.position.x;
    const endGap = Math.abs(pets.find(({ id }) => id === "pet-b")!.position.x - stageLeadX);

    expect(endGap - startGap).toBeGreaterThanOrEqual(32);

    for (let elapsed = 0; elapsed < DANCE_BEAT_MS * 3; elapsed += 16) {
      scenario.clock.advanceBy(16);
      scenario.world.step(16);
    }
    const soloLeadX = scenario.world.snapshot().pets.find(({ id }) => id === "pet-a")!.position.x;
    expect(soloLeadX - stageLeadX).toBeGreaterThanOrEqual(16);
  });

  it("gives a pair alternating inward steps without crossing", () => {
    expect(danceStepOffsets(2, 0)).toEqual([0, 0]);
    expect(danceStepOffsets(2, DANCE_BEAT_MS)).toEqual([0, 0]);
    expect(danceStepOffsets(2, DANCE_BEAT_MS * 2)).toEqual([1.5, 0]);
    expect(danceStepOffsets(2, DANCE_BEAT_MS * 5)).toEqual([0, -1.5]);
    expect(danceStepOffsets(2, DANCE_BEAT_MS * 8)).toEqual([-0.5, 0.5]);

    const basePositions = [-2, 2];
    for (let beat = 0; beat < 11; beat += 1) {
      const offsets = danceStepOffsets(2, DANCE_BEAT_MS * beat);
      expect(basePositions[0] + offsets[0]).toBeLessThan(basePositions[1] + offsets[1]);
    }
  });

  it("reserves the final two beats for a shared flourish", () => {
    expect(isDanceFlourish(DANCE_BEAT_MS * 8)).toBe(false);
    expect(isDanceFlourish(DANCE_BEAT_MS * 9)).toBe(true);
    expect(isDanceFlourish(DANCE_BEAT_MS * 10)).toBe(true);
    expect(isDanceFlourish(DANCE_BEAT_MS * 11)).toBe(false);
  });
});
