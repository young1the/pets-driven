import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
  runCollisionBehaviorSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";

const BOUNDS = { width: 960, height: 540 };

function makePet(id: string, x: number, intent: "idle" | "active" | "seek") {
  return {
    id,
    components: [
      { type: "Transform" as const, position: { x, y: 500 } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
      { type: "IntentState" as const, intent },
      {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      },
    ],
  };
}

/** makePet with explicit Personality so reaction latency is deterministic. */
function makePetWithPersonality(
  id: string,
  x: number,
  intent: "idle" | "active" | "seek",
  extraversion = 0.5,
  neuroticism = 0.5,
) {
  return {
    id,
    components: [
      { type: "Transform" as const, position: { x, y: 500 } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
      { type: "IntentState" as const, intent },
      {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      },
      {
        type: "Personality" as const,
        openness: 0.5,
        conscientiousness: 0.4,
        extraversion,
        agreeableness: 0.5,
        neuroticism,
      },
    ],
  };
}

describe("collision behavior system (Phase 4: PendingReaction)", () => {
  it("writes PendingReaction and claims decision when entities overlap", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe(
      "collision",
    );
  });

  it("clears existing MotionTarget and resets intent to idle on collision (pet truly freezes)", () => {
    // Pet-a was actively heading toward pet-b (approach-pet target) when they collided.
    // The collision freeze must clear the target immediately so pet-a stops moving.
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" as const },
          // Active motion target — e.g., from approach-pet
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: { x: 110, y: 500 },
          },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "Transform" as const, position: { x: 110, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
        ],
      },
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    // PendingReaction written
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
    // MotionTarget cleared so locomotion systems see no target → pet stops
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetEntityId,
    ).toBeNull();
    // Intent reset to idle
    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
  });

  it("working pet collision writes a visual expression and clears working wander target", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle",
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: { x: 300, y: 500 },
          },
          { type: "AgentTaskState" as const, status: "working", since: 0 },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.2,
            neuroticism: 0.8,
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous",
            decidedAt: 100,
            expiresAt: 850,
            reason: "working-wander",
            lastAutonomousReason: "working-wander",
            lastAutonomousAt: 100,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(200));

    expect(store.getComponent("pet-a", "AgentTaskState")?.status).toBe(
      "working",
    );
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(
      store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt,
    ).toBe(200);
    expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 200,
    });
  });

  it("working pet collision replaces a stale pending reaction with a visual expression", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle",
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: { x: 300, y: 500 },
          },
          { type: "AgentTaskState" as const, status: "working", since: 150 },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.2,
            neuroticism: 0.8,
          },
          {
            type: "PendingReaction" as const,
            source: "collision",
            triggeredAt: 100,
            reactsAt: 600,
            context: {
              otherEntityId: "pet-b",
              otherPosition: { x: 110, y: 500 },
            },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "collision",
            decidedAt: 100,
            expiresAt: 600,
            reason: "entity overlap",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(200));

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(
      store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt,
    ).toBe(200);
    expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 200,
    });
  });

  it("working pet collision expires autonomous collision claims after clearing motion", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle",
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: { x: 48, y: 500 },
          },
          { type: "AgentTaskState" as const, status: "working", since: 150 },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.2,
            neuroticism: 0.8,
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous",
            decidedAt: 100,
            expiresAt: 850,
            reason: "collision-flee",
            lastAutonomousReason: "collision-flee",
            lastAutonomousAt: 100,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(200));

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(
      store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt,
    ).toBe(200);
    expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 200,
    });
  });

  it("working collision expression duration is derived from OCEAN and clamped", () => {
    const irritated = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle",
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          { type: "AgentTaskState" as const, status: "working", since: 0 },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0,
            extraversion: 1,
            agreeableness: 0,
            neuroticism: 1,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(irritated, BOUNDS, createManualClock(1000));

    expect(
      irritated.getComponent("pet-a", "PetExpressionState")?.expiresAt,
    ).toBe(1900);

    const steady = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle",
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          { type: "AgentTaskState" as const, status: "working", since: 0 },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 1,
            extraversion: 0,
            agreeableness: 1,
            neuroticism: 0,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(steady, BOUNDS, createManualClock(1000));

    expect(steady.getComponent("pet-a", "PetExpressionState")?.expiresAt).toBe(
      1350,
    );
  });

  it("does not react when entities are far apart", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 500, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(
      store.getComponent("pet-a", "BehaviorDecisionState"),
    ).toBeUndefined();
  });

  it("uses Matter-derived PetCollision even when bodies no longer overlap by AABB", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "PetCollision" as const,
            otherEntityId: "pet-b",
            otherPosition: { x: 150, y: 500 },
            startedAt: 984,
            lastSeenAt: 1000,
          },
        ],
      },
      makePet("pet-b", 150, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toMatchObject({
      source: "collision",
      context: {
        otherEntityId: "pet-b",
        otherPosition: { x: 150, y: 500 },
      },
    });
  });

  it("skips entity that already has a higher-priority claim", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "seek" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: "user-anchor",
            targetPosition: { x: 480, y: 500 },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "agent-event" as const,
            decidedAt: 900,
            expiresAt: 6000,
            reason: "task.started",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe(
      "agent-event",
    );
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBe(
      "user-anchor",
    );
    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
  });

  it("does not overwrite PendingReaction while deliberation is in progress", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePetWithPersonality("pet-a", 100, "idle", 0.5, 0.5),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);
    const firstReaction = store.getComponent("pet-a", "PendingReaction");
    const firstDecision = store.getComponent("pet-a", "BehaviorDecisionState");
    expect(firstReaction).toBeDefined();

    clock.advanceBy(16);
    runCollisionBehaviorSystem(store, BOUNDS, clock);

    // PendingReaction and claim must be unchanged
    expect(store.getComponent("pet-a", "PendingReaction")).toEqual(
      firstReaction,
    );
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toEqual(
      firstDecision,
    );
  });

  it("does not write PendingReaction for a climbing entity", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 400 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: { x: 100, y: 280 },
          },
          { type: "ClimbingTag" as const },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual(
      { x: 100, y: 280 },
    );
    expect(
      store.getComponent("pet-a", "BehaviorDecisionState"),
    ).toBeUndefined();
  });

  it("does not freeze a non-flying airborne entity during overlap", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 430 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "WalkingTag" as const },
          { type: "AirborneTag" as const },
          { type: "IntentState" as const, intent: "active" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: { x: 240, y: 430 },
          },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "Transform" as const, position: { x: 110, y: 430 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
        ],
      },
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual(
      { x: 240, y: 430 },
    );
    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("active");
    expect(
      store.getComponent("pet-a", "BehaviorDecisionState"),
    ).toBeUndefined();
  });

  it("expires the collision claim as soon as overlap ends", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe(
      "collision",
    );

    store.setComponent("pet-b", {
      type: "Transform",
      position: { x: 500, y: 500 },
    });
    clock.advanceBy(200);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    const claim = store.getComponent("pet-a", "BehaviorDecisionState");
    expect(claim?.expiresAt).toBeLessThanOrEqual(clock.now());
  });

  it("overwrites an expired claim", () => {
    const clock = createManualClock(10000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "agent-event" as const,
            decidedAt: 900,
            expiresAt: 5000,
            reason: "task.started",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe(
      "collision",
    );
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
  });

  it("does not restart collision while a collision-flee target is escaping overlap", () => {
    const clock = createManualClock(1500);
    const fleeTarget = { x: 48, y: 500 };
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: fleeTarget,
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous" as const,
            decidedAt: 1400,
            expiresAt: 2150,
            reason: "collision-flee",
            lastAutonomousReason: "collision-flee",
            lastAutonomousAt: 1400,
          },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual(
      fleeTarget,
    );
    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.reason).toBe(
      "collision-flee",
    );
  });

  it("restarts collision when a stale collision-flee target crosses the current collider", () => {
    const clock = createManualClock(26750);
    const staleFleeTarget = { x: 355, y: 492 };
    const store = createComponentStore([
      {
        id: "pet-c",
        components: [
          { type: "Transform" as const, position: { x: 203, y: 521 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "active" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: staleFleeTarget,
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous" as const,
            decidedAt: 26736,
            expiresAt: 27236,
            reason: "collision-flee",
            lastAutonomousReason: "collision-flee",
            lastAutonomousAt: 26736,
          },
          {
            type: "PetCollision" as const,
            otherEntityId: "pet-d",
            otherPosition: { x: 239, y: 521 },
            startedAt: 26736,
            lastSeenAt: 26750,
          },
        ],
      },
      makePet("pet-d", 239, "active"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-c", "PendingReaction")).toBeDefined();
    expect(
      store.getComponent("pet-c", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(store.getComponent("pet-c", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-c", "BehaviorDecisionState")?.source).toBe(
      "collision",
    );
  });
});

// ── Phase 4: Reaction latency + decision + planning ────────────────────────

/**
 * Build a store where pet has a PendingReaction already set and a matching
 * (already-expired) collision claim at reactsAt=1400, simulating the instant
 * the deliberation window closes and BehaviorDecisionSystem should fire.
 * Hoisted to file scope so distribution and reachability describe blocks can reuse it.
 */
function makeReactionStore(
  extraversion: number,
  neuroticism: number,
  agreeableness: number,
  otherPosition = { x: 200, y: 500 },
) {
  const reactsAt = 1400; // now will be 1400 (claim expired)
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Transform" as const, position: { x: 100, y: 500 } },
        { type: "IntentState" as const, intent: "idle" as const },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: null,
        },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion,
          agreeableness,
          neuroticism,
        },
        {
          type: "Perception" as const,
          userAnchor: null,
          nearbyPets: [],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, intent: "idle" as const },
        },
        {
          type: "PendingReaction" as const,
          source: "collision" as const,
          triggeredAt: 1000,
          reactsAt,
          context: { otherEntityId: "pet-b", otherPosition },
        },
        {
          // Claim already expired (expiresAt === now), so Decision can fire.
          type: "BehaviorDecisionState" as const,
          source: "collision" as const,
          decidedAt: 1000,
          expiresAt: reactsAt,
          reason: "entity overlap",
          lastAutonomousReason: null,
          lastAutonomousAt: null,
        },
      ],
    },
    {
      id: "pet-b",
      components: [
        { type: "Transform" as const, position: otherPosition },
        {
          type: "PhysicsBody" as const,
          shape: "rectangle" as const,
          width: 32,
          height: 38,
        },
      ],
    },
  ]);
}

describe("Phase 4 — collision reaction latency and personality-shaped response", () => {
  it("PendingReaction.reactsAt = triggeredAt + reactionLatencyMs(personality, collision)", () => {
    // Alice-like (E=0.85, N=0.1): latency = 400*(1 + 0.1*1.5 - 0.85*0.5) = 400*0.725 = 290ms
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePetWithPersonality("pet-a", 100, "idle", 0.85, 0.1),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    const reaction = store.getComponent("pet-a", "PendingReaction");
    expect(reaction?.triggeredAt).toBe(1000);
    expect(reaction?.reactsAt).toBeCloseTo(1000 + 290, -1); // ±10 ms tolerance
  });

  it("pet does not get a new token while now < reactsAt (frozen)", () => {
    // reactsAt = 1400; we only advance to 1300 → still deliberating
    const reactsAt = 1400;
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.5,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "PendingReaction" as const,
            source: "collision" as const,
            triggeredAt: 1000,
            reactsAt,
            context: { otherPosition: { x: 200, y: 500 } },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "collision" as const,
            decidedAt: 1000,
            expiresAt: reactsAt,
            reason: "entity overlap",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
    ]);

    // Tick with now = 1300 (< reactsAt 1400) — claim still active
    runBehaviorDecisionSystem(
      store,
      createManualClock(1300),
      createSeededRandom(1),
      BOUNDS,
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "PendingReaction")).toBeDefined();
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).toBeNull();
  });

  it("at reactsAt, Decision emits a collision-* token and removes PendingReaction", () => {
    // now = reactsAt = 1400 → claim expired → reactive pool fires
    const store = makeReactionStore(0.5, 0.5, 0.5);
    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toMatch(/^collision-/);
    expect(token?.consumed).toBe(false);
    expect(store.getComponent("pet", "PendingReaction")).toBeUndefined();
  });

  it("high-N low-A pet selects collision-flee at reactsAt (seed 1)", () => {
    // N=0.9, A=0.1: scoreFleeFromPet = 0.2+0.9*0.7-0.1*0.5 = 0.78 (dominant)
    const store = makeReactionStore(0.5, 0.9, 0.1);
    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe(
      "collision-flee",
    );
  });

  it("grounded walking pets can pick collision-jump when still trapped in contact", () => {
    const store = makeReactionStore(0.95, 0.9, 0.1, { x: 110, y: 500 });
    store.setComponent("pet", {
      type: "PhysicsBody",
      shape: "rectangle",
      width: 32,
      height: 38,
    });
    store.setComponent("pet-b", {
      type: "Transform",
      position: { x: 110, y: 500 },
    });
    store.setComponent("pet-b", {
      type: "PhysicsBody",
      shape: "rectangle",
      width: 32,
      height: 38,
    });
    store.setComponent("pet", { type: "WalkingTag" });
    store.setComponent("pet", { type: "CanJump", impulse: 0.009 });
    store.setComponent("pet", {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });

    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );
    runBehaviorPlanningSystem(store, createManualClock(1400));

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe(
      "collision-jump",
    );
    expect(store.getComponent("pet", "JumpActionState")).toEqual({
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition?.x,
    ).toBeLessThan(100);
  });

  it("collision-flee target is far enough to escape the collision area", () => {
    const store = makeReactionStore(0.5, 0.9, 0.1, { x: 600, y: 500 });
    store.setComponent("pet", {
      type: "Transform",
      position: { x: 500, y: 500 },
    });
    store.setComponent("pet", {
      type: "PhysicsBody",
      shape: "rectangle",
      width: 32,
      height: 38,
    });

    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("collision-flee");
    expect(token?.targetPosition?.x).toBeCloseTo(308, 0);
  });

  it("high-E high-A low-N pet selects collision-engage at reactsAt (seed 1)", () => {
    // E=0.9, A=0.9, N=0.1: scoreCollisionEngage = 0.2+0.9*0.5+0.9*0.5-0.1*0.4 = 1.06 (dominant)
    const store = makeReactionStore(0.9, 0.1, 0.9);
    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe(
      "collision-engage",
    );
  });

  // Regression: engageTarget must sit BETWEEN self and other, not on the far
  // side. The earlier `otherPos - away * D` placed the target past the other
  // pet, causing pets to walk through each other and re-collide forever (the
  // "pets clustering in one spot" bug). The y axis is clamped near the floor
  // (y=500 → 492 due to COLLISION_TARGET_MARGIN=48 within bounds.height=540),
  // so assertions focus on x — that is where the sign-flip bug lives.
  it("collision-engage Decision places target on SELF's side, 80px from other", () => {
    // Pet at (100, 500), other at (200, 500). away points (-1, 0).
    // Correct engage target: other + away*80 = (200-80, 500) = (120, 500).
    // Buggy target would be (280, 500) — past the other pet.
    const store = makeReactionStore(0.9, 0.1, 0.9, { x: 200, y: 500 });
    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("collision-engage");
    expect(token?.targetPosition?.x).toBeCloseTo(120, 0);
    // The target must lie between pet (100) and other (200), strictly.
    expect(token?.targetPosition?.x).toBeGreaterThan(100);
    expect(token?.targetPosition?.x).toBeLessThan(200);
  });

  it("collision-engage Decision target is closer to other than pet is (approach, not pass-through)", () => {
    // Pet at (100, 500), other at (300, 500). away = (-1, 0).
    // Correct: target = other + away*80 = (220, 500) — between pet and other,
    //   closer to other. Pet walks 120 units toward other and stops 80 short.
    // Buggy: target = other - away*80 = (380, 500) — past the other pet,
    //   would force the pet to walk through other and re-collide forever.
    const store = makeReactionStore(0.9, 0.1, 0.9, { x: 300, y: 500 });
    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("collision-engage");
    expect(token?.targetPosition?.x).toBeCloseTo(220, 0);
    expect(token?.targetPosition?.x).toBeLessThan(300); // not past the other pet
    expect(token?.targetPosition?.x).toBeGreaterThan(100); // moved toward other
  });

  it("walking pets use a horizontal escape target for vertical collision-flee", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "WalkingTag" as const },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.1,
            neuroticism: 0.9,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: true, climbing: false, intent: "idle" as const },
          },
          {
            type: "PendingReaction" as const,
            source: "collision" as const,
            triggeredAt: 1000,
            reactsAt: 1400,
            context: {
              otherEntityId: "flying-pet",
              otherPosition: { x: 100, y: 430 },
            },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "collision" as const,
            decidedAt: 1000,
            expiresAt: 1400,
            reason: "entity overlap",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
    ]);

    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("collision-flee");
    expect(
      Math.abs((token?.targetPosition?.x ?? 100) - 100),
    ).toBeGreaterThanOrEqual(90);
  });

  it("collision-flee Planning: MotionTarget points away from otherPosition", () => {
    // Pet at (100,500), other at (200,500) → flee direction = (-1,0) → target ≈ (4,500) clamped to (48,500)
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-flee" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 48, y: 500 }, // pre-computed flee position
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetPosition).toEqual({ x: 48, y: 500 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(
      true,
    );
  });

  it("collision-engage Planning: MotionTarget points toward otherPosition", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-engage" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 160, y: 500 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetPosition).toEqual({ x: 160, y: 500 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("collision-avoid Planning: MotionTarget points perpendicular to incoming direction", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-avoid" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 100, y: 404 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 100,
      y: 404,
    });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("collision-unfazed Planning: moves to a wander-near position and resumes", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-unfazed" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 150, y: 480 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 150,
      y: 480,
    });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("calm agreeable pet can select collision-stay at reactsAt", () => {
    const store = makeReactionStore(0.1, 0.1, 0.95);

    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe(
      "collision-stay",
    );
  });

  it("does not select collision-stay while the colliding bodies still overlap", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.1,
            agreeableness: 0.95,
            neuroticism: 0.1,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: true, climbing: false, intent: "idle" as const },
          },
          {
            type: "PendingReaction" as const,
            source: "collision" as const,
            triggeredAt: 1000,
            reactsAt: 1400,
            context: {
              otherEntityId: "pet-b",
              otherPosition: { x: 110, y: 500 },
            },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "collision" as const,
            decidedAt: 1000,
            expiresAt: 1400,
            reason: "entity overlap",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "Transform" as const, position: { x: 110, y: 500 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
        ],
      },
    ]);

    runBehaviorDecisionSystem(
      store,
      createManualClock(1400),
      createSeededRandom(1),
      BOUNDS,
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).not.toBe(
      "collision-stay",
    );
  });

  it("collision-stay Planning keeps the pet idle without a target", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          {
            type: "MotionTarget" as const,
            targetEntityId: null,
            targetPosition: null,
          },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-stay" as const,
            decidedAt: 0,
            consumed: false,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(
      true,
    );
  });
});

// ── Phase 4: Reactive candidate distribution and reachability ─────────────
//
// Verifies that the softmax weights over collision-* candidates produce
// statistically correct distributions, and that the reactive outcomes are
// reachable under the right personality configuration.

describe("Phase 4 — reactive candidate distribution (1000 samples)", () => {
  /**
   * High-N (0.9) low-A (0.1):
   *   flee   = 0.78  (dominant)
   *   avoid  = 0.40
   *   unfazed= 0.19
   *   engage = 0.14
   *   T = 0.52 → theoretical flee ≈ 47.7%, engage ≈ 13.9%
   */
  it("high-N low-A: collision-flee wins significantly more often than collision-engage", () => {
    const SAMPLES = 1000;
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < SAMPLES; seed++) {
      const store = makeReactionStore(0.5, 0.9, 0.1); // E=0.5, N=0.9, A=0.1
      runBehaviorDecisionSystem(
        store,
        createManualClock(1400),
        createSeededRandom(seed * 1013 + 7),
        BOUNDS,
      );
      const kind =
        store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    // Theoretical flee ≈ 477; generous band to account for sampling variance
    expect(counts["collision-flee"] ?? 0).toBeGreaterThan(350);
    // Theoretical engage ≈ 139; must not dominate
    expect(counts["collision-engage"] ?? 0).toBeLessThan(220);
  });

  /**
   * High-E (0.9) high-A (0.9) low-N (0.1):
   *   engage = 1.06  (dominant)
   *   unfazed= 0.51
   *   avoid  = 0.40
   *   flee   = -0.18
   *   T = 0.28 → theoretical engage ≈ 80.2%, flee < 1%
   */
  it("high-E high-A low-N: collision-engage wins significantly more often than collision-flee", () => {
    const SAMPLES = 1000;
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < SAMPLES; seed++) {
      const store = makeReactionStore(0.9, 0.1, 0.9); // E=0.9, N=0.1, A=0.9
      runBehaviorDecisionSystem(
        store,
        createManualClock(1400),
        createSeededRandom(seed * 1013 + 7),
        BOUNDS,
      );
      const kind =
        store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    // Theoretical engage ≈ 802; generous lower bound
    expect(counts["collision-engage"] ?? 0).toBeGreaterThan(700);
    // Theoretical flee ≈ 9.5; essentially never
    expect(counts["collision-flee"] ?? 0).toBeLessThan(50);
  });
});

describe("Phase 4 — reactive outcomes are reachable", () => {
  /**
   * collision-avoid (score = 0.40 constant) wins when flee, engage, and unfazed
   * are all suppressed: low-E (0.2), mid-N (0.5), mid-A (0.5).
   *   flee   = 0.30, engage = 0.35, avoid = 0.40 (max), unfazed = 0.35
   *   T = 0.40 → avoid wins ≈ 28% of samples; found within 500 seeds.
   */
  it("collision-avoid is reachable (low-E mid-N mid-A, sweep 500 seeds)", () => {
    let found = false;
    for (let seed = 0; seed < 500 && !found; seed++) {
      const store = makeReactionStore(0.2, 0.5, 0.5); // E=0.2, N=0.5, A=0.5
      runBehaviorDecisionSystem(
        store,
        createManualClock(1400),
        createSeededRandom(seed * 1013),
        BOUNDS,
      );
      if (
        store.getComponent("pet", "BehaviorDecisionToken")?.kind ===
        "collision-avoid"
      ) {
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  /**
   * collision-unfazed (score = 0.15 + (1-N)*0.4) wins when N is near 0
   * and E+A are low enough to keep engage below unfazed.
   *   N=0, E=0.2, A=0.2: flee=0.10, engage=0.40, avoid=0.40, unfazed=0.55 (max)
   *   T = 0.25 → unfazed wins ≈ 44% of samples; found within 100 seeds.
   */
  it("collision-unfazed is reachable (low-N low-E low-A, sweep 100 seeds)", () => {
    let found = false;
    for (let seed = 0; seed < 100 && !found; seed++) {
      const store = makeReactionStore(0.2, 0.0, 0.2); // E=0.2, N=0.0, A=0.2
      runBehaviorDecisionSystem(
        store,
        createManualClock(1400),
        createSeededRandom(seed * 1013),
        BOUNDS,
      );
      if (
        store.getComponent("pet", "BehaviorDecisionToken")?.kind ===
        "collision-unfazed"
      ) {
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe("collision vs social priority (B1: social outranks collision)", () => {
  it("skips collision reactions for a pet holding a live social claim", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);
    store.setComponent("pet-a", {
      type: "BehaviorDecisionState",
      source: "social",
      decidedAt: 900,
      expiresAt: 1_250,
      reason: "session-chat",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    // The session member shrugs the bump off entirely...
    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe(
      "social",
    );
    // ...while the unclaimed other pet still reacts normally.
    expect(store.getComponent("pet-b", "PendingReaction")).toBeDefined();
    expect(store.getComponent("pet-b", "BehaviorDecisionState")?.source).toBe(
      "collision",
    );
  });
});

describe("session-partner collision immunity (B2)", () => {
  function withMember(pet: ReturnType<typeof makePet>, partnerId: string) {
    return {
      id: pet.id,
      components: [
        ...pet.components,
        {
          type: "SocialSessionMember" as const,
          sessionId: "sess",
          partnerId,
          role: "initiator" as const,
        },
      ],
    };
  }

  it("ignores overlap with the session partner even without a live social claim", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      withMember(makePet("pet-a", 100, "idle"), "pet-b"),
      withMember(makePet("pet-b", 110, "idle"), "pet-a"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-b", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("still reacts to a third pet bumping into a session member", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      // Partner is far away; the overlap comes from an outsider.
      withMember(makePet("pet-a", 100, "idle"), "pet-b"),
      withMember(makePet("pet-b", 400, "idle"), "pet-a"),
      makePet("pet-c", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    const reaction = store.getComponent("pet-a", "PendingReaction");
    expect(reaction?.context.otherEntityId).toBe("pet-c");
    expect(store.getComponent("pet-c", "PendingReaction")).toBeDefined();
  });
});

describe("per-pair collision reaction cooldown (B3)", () => {
  it("does not re-react to the same neighbor within the cooldown window", () => {
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(1_000));
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();

    // Simulate the reaction being consumed: deliberation done, claim lapsed,
    // but the pair is still overlapping 2s later.
    store.removeComponent("pet-a", "PendingReaction");
    store.removeComponent("pet-b", "PendingReaction");
    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(3_000));

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-b", "PendingReaction")).toBeUndefined();
  });

  it("reacts again once the pair cooldown has lapsed", () => {
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(1_000));
    store.removeComponent("pet-a", "PendingReaction");
    store.removeComponent("pet-b", "PendingReaction");

    // 6s pair cooldown measured from the reaction at t=1000.
    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(7_100));

    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
  });

  it("a fresh neighbor is not affected by another pair's cooldown", () => {
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(1_000));
    store.removeComponent("pet-a", "PendingReaction");
    store.removeComponent("pet-b", "PendingReaction");

    // pet-b wanders off; pet-c bumps into pet-a during pet-b's cooldown.
    store.setComponent("pet-b", { type: "Transform", position: { x: 400, y: 500 } });
    store.spawn("pet-c", makePet("pet-c", 108, "idle").components);
    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(3_000));

    expect(
      store.getComponent("pet-a", "PendingReaction")?.context.otherEntityId,
    ).toBe("pet-c");
  });
});
