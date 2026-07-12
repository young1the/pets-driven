import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
  runFeintProgressSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

const BOUNDS = { x: 0, y: 0, width: 960, height: 540 };

function decisionStore(catalogId: PetPersonalityId) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: 260, y: 500 } },
      ],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 500 } },
        { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
        { type: "WalkingTag" },
        { type: "Steering", mode: "stand" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        {
          type: "ContactState",
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        {
          type: "Perception",
          userAnchor: {
            id: "user-anchor",
            position: { x: 260, y: 500 },
            distance: 60,
          },
          nearbyPets: [],
          nearbyClimbables: [],
          self: { grounded: true, climbing: false, mode: "stand" },
        },
        {
          type: "Personality",
          catalogId,
          openness: 0.5,
          conscientiousness: 0.5,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.2,
        },
        { type: "Drives", social: 0.3, energy: 0.6, curiosity: 0.2 },
      ],
    },
  ]);
}

function probability(
  store: ReturnType<typeof decisionStore>,
  kind: string,
): number {
  return (
    store
      .getComponent("pet", "BehaviorDecisionToken")
      ?.selectionTrace?.candidates.find((candidate) => candidate.kind === kind)
      ?.probability ?? 0
  );
}

function signatureProbability(catalogId: PetPersonalityId, kind: string) {
  const store = decisionStore(catalogId);
  runBehaviorDecisionSystem(
    store,
    createManualClock(0),
    createSeededRandom(1),
    BOUNDS,
  );
  return probability(store, kind);
}

function stationaryActivityStore(kind: "nap" | "meditate") {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Steering", mode: "stand" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "Drives", social: 0.3, energy: 0.2, curiosity: 0.2 },
        { type: "MoodState", valence: -0.2, arousal: 0.7, confidence: 0.4 },
        { type: "RecentExperienceMemory", entries: [] },
        {
          type: "BehaviorDecisionToken",
          kind,
          decidedAt: 0,
          consumed: false,
          activityDurationMs: 8_000,
        },
      ],
    },
  ]);
}

describe("personality signature activities", () => {
  it("makes each target catalog strongly prefer its own signature activity", () => {
    expect(signatureProbability("lazy", "nap")).toBeGreaterThan(
      signatureProbability("playful", "nap"),
    );
    expect(signatureProbability("zen", "meditate")).toBeGreaterThan(
      signatureProbability("gentle", "meditate"),
    );
    expect(signatureProbability("mischievous", "play-feint")).toBeGreaterThan(
      signatureProbability("curious", "play-feint"),
    );
  });

  it("materializes a nap as a long sleepy rest that restores energy", () => {
    const store = stationaryActivityStore("nap");
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "expressive",
      mood: "sleepy",
      emote: "zzz",
      expiresAt: 8_000,
    });
    expect(store.getComponent("pet", "Drives")?.energy).toBeCloseTo(0.5);
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "rested",
    );
  });

  it("materializes meditation as a self-soothing stationary activity", () => {
    const store = stationaryActivityStore("meditate");
    const arousalBefore = store.getComponent("pet", "MoodState")!.arousal;
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "expressive",
      mood: "happy",
      emote: "sparkle",
    });
    expect(store.getComponent("pet", "MoodState")!.arousal).toBeLessThan(
      arousalBefore,
    );
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "self-soothed",
    );
  });

  it("runs a feint through approach, retreat, and a playful finish", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [{ type: "Transform", position: { x: 260, y: 500 } }],
      },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 500 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "MoodState", valence: 0, arousal: 0.4, confidence: 0.6 },
          { type: "RecentExperienceMemory", entries: [] },
          {
            type: "BehaviorDecisionState",
            source: "autonomous",
            decidedAt: 0,
            expiresAt: 4_000,
            reason: "play-feint",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
          {
            type: "BehaviorDecisionToken",
            kind: "play-feint",
            decidedAt: 0,
            consumed: false,
            targetEntityId: "user-anchor",
            targetPosition: { x: 260, y: 500 },
            activityDurationMs: 4_000,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, clock);
    expect(store.getComponent("pet", "FeintState")?.phase).toBe("approach");
    expect(store.getComponent("pet", "MotionTarget")?.targetEntityId).toBe(
      "user-anchor",
    );

    clock.advanceBy(1_200);
    runFeintProgressSystem(store, clock, BOUNDS);
    expect(store.getComponent("pet", "FeintState")?.phase).toBe("retreat");
    expect(store.getComponent("pet", "MotionTarget")?.targetEntityId).toBeNull();
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition?.x).toBeLessThan(
      200,
    );
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "signature",
      mood: "excited",
      emote: "exclaim",
    });

    clock.advanceBy(2_800);
    runFeintProgressSystem(store, clock, BOUNDS);
    expect(store.getComponent("pet", "FeintState")).toBeUndefined();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "played",
    );
  });
});

