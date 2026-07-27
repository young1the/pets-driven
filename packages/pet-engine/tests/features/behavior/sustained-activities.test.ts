import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runRompProgressSystem } from "@pets-driven/pet-engine/features/behavior/activity-progress-systems";
import {
  runArrivalBehaviorSystem,
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { width: 960, height: 540 };

/** Constant random: a roll near 1 selects the last softmax candidate (idle-stay). */
function constantRandom(value: number): RandomSource {
  return { next: () => value };
}

/**
 * Three-candidate store (wander-near / wander-far / idle-stay): no user
 * anchor, no jump or climb capability, no nearby pets.
 */
function makeRestingStore(extraversion: number) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Steering", mode: "stand" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        {
          type: "Perception" as const,
          userAnchor: null,
          nearbyPets: [],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion,
          agreeableness: 0.5,
          neuroticism: 0.2,
        },
      ],
    },
  ]);
}

describe("idle-stay as a sustained rest", () => {
  it("holds the claim for seconds, not the 500ms autonomous default", () => {
    const store = makeRestingStore(0.2);

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.999), BOUNDS);

    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.reason).toBe("idle-stay");
    expect(claim!.expiresAt - claim!.decidedAt).toBeGreaterThanOrEqual(3_000);
  });

  it("introverts rest longer than extraverts", () => {
    const introvert = makeRestingStore(0.05);
    runBehaviorDecisionSystem(introvert, createManualClock(0), constantRandom(0.999), BOUNDS);
    const introvertClaim = introvert.getComponent("pet", "BehaviorDecisionState");

    const extravert = makeRestingStore(0.95);
    runBehaviorDecisionSystem(extravert, createManualClock(0), constantRandom(0.999), BOUNDS);
    const extravertClaim = extravert.getComponent("pet", "BehaviorDecisionState");

    expect(introvertClaim?.reason).toBe("idle-stay");
    expect(extravertClaim?.reason).toBe("idle-stay");
    expect(introvertClaim!.expiresAt).toBeGreaterThan(extravertClaim!.expiresAt);
  });
});

describe("arrival dwell", () => {
  function makeArrivedStore() {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 600, y: 500 } },
          { type: "Steering", mode: "pursue" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 604, y: 500 } },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.2,
          },
        ],
      },
    ]);
  }

  it("grants a rest beat after a completed walk", () => {
    const store = makeArrivedStore();

    runArrivalBehaviorSystem(store, createManualClock(10_000), constantRandom(0.5));

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.source).toBe("autonomous");
    expect(claim?.reason).toBe("arrival-dwell");
    expect(claim!.expiresAt).toBeGreaterThan(10_000);
  });

  it("carries the last genuine autonomous decision forward for repeat-cooldowns", () => {
    const store = makeArrivedStore();
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 8_000,
      expiresAt: 8_500, // long expired by arrival time
      reason: "wander-near",
      lastAutonomousReason: "wander-near",
      lastAutonomousAt: 8_000,
    });

    runArrivalBehaviorSystem(store, createManualClock(10_000), constantRandom(0.5));

    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.reason).toBe("arrival-dwell");
    expect(claim?.lastAutonomousReason).toBe("wander-near");
    expect(claim?.lastAutonomousAt).toBe(8_000);
  });

  it("never steals the pet from a live higher-priority claim", () => {
    const store = makeArrivedStore();
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "social",
      decidedAt: 9_900,
      expiresAt: 12_000,
      reason: "session-chat",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runArrivalBehaviorSystem(store, createManualClock(10_000), constantRandom(0.5));

    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.source).toBe("social");
    expect(claim?.reason).toBe("session-chat");
  });
});

describe("play-romp", () => {
  function makeRompingStore(now: number, endsAt: number) {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 400, y: 500 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "WalkingTag" },
          { type: "CanWalk", force: 0.01 },
          { type: "CanJump", impulse: 0.009 },
          { type: "PhysicsBody", shape: "rectangle" as const, width: 32, height: 38 },
          {
            type: "ContactState",
            grounded: true,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "RompState", startedAt: now - 100, endsAt, nextHopAt: now },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous" as const,
            decidedAt: now - 100,
            expiresAt: endsAt,
            reason: "play-romp",
            lastAutonomousReason: "play-romp",
            lastAutonomousAt: now - 100,
          },
          {
            type: "Personality" as const,
            openness: 0.7,
            conscientiousness: 0.4,
            extraversion: 0.9,
            agreeableness: 0.5,
            neuroticism: 0.1,
          },
        ],
      },
    ]);
  }

  it("planning materializes the token into RompState and an excited cue", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          {
            type: "BehaviorDecisionToken" as const,
            kind: "play-romp" as const,
            decidedAt: 1_000,
            consumed: false,
            activityDurationMs: 5_000,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet", "RompState")).toMatchObject({
      startedAt: 1_000,
      endsAt: 6_000,
      nextHopAt: 1_000,
    });
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "romp",
      mood: "excited",
    });
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("hops toward a nearby dash target while the romp is live", () => {
    const store = makeRompingStore(2_000, 8_000);

    runRompProgressSystem(store, createManualClock(2_000), constantRandom(0.5), BOUNDS);

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetPosition).not.toBeNull();
    expect(motion?.speedFactor).toBeGreaterThan(1);
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "JumpActionState")?.phase).toBe("requested");
    expect(store.getComponent("pet", "RompState")?.nextHopAt).toBeGreaterThan(2_000);
  });

  it("ends gracefully: stops the pet, grants a breather and a happy cue", () => {
    const store = makeRompingStore(2_000, 8_000);

    runRompProgressSystem(store, createManualClock(8_000), constantRandom(0.5), BOUNDS);

    expect(store.getComponent("pet", "RompState")).toBeUndefined();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.reason).toBe("arrival-dwell");
    expect(claim!.expiresAt).toBeGreaterThan(8_000);
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "romp",
      mood: "happy",
    });
  });

  it("cancels quietly when a higher-priority claim has taken the pet over", () => {
    const store = makeRompingStore(2_000, 8_000);
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "collision",
      decidedAt: 2_000,
      expiresAt: 3_000,
      reason: "entity overlap",
      lastAutonomousReason: "play-romp",
      lastAutonomousAt: 1_900,
    });

    runRompProgressSystem(store, createManualClock(2_100), constantRandom(0.5), BOUNDS);

    expect(store.getComponent("pet", "RompState")).toBeUndefined();
    // The interrupter keeps ownership: no motion target or intent written.
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "BehaviorDecisionState")?.source).toBe("collision");
  });
});
