import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { createManualClock } from "@/shared/time/manual-clock";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
  runCollisionBehaviorSystem,
} from "@/features/behavior/systems";
import { createSeededRandom } from "@/shared/random/seeded-random";

const BOUNDS = { width: 960, height: 540 };

function makePet(id: string, x: number, intent: "idle" | "active" | "seek") {
  return {
    id,
    components: [
      { type: "Transform" as const, position: { x, y: 500 } },
      { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
      { type: "IntentState" as const, intent },
      { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
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
      { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
      { type: "IntentState" as const, intent },
      { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
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
  it("writes PendingReaction and claims decision when entities overlap; MotionTarget unchanged", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    // Phase 4: PendingReaction written, MotionTarget NOT changed (pet freezes)
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("collision");
  });

  it("does not react when entities are far apart", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 500, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("skips entity that already has a higher-priority claim", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
          { type: "IntentState" as const, intent: "seek" as const },
          { type: "MotionTarget" as const, targetEntityId: "user-anchor", targetPosition: { x: 480, y: 500 } },
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

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("agent-event");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBe("user-anchor");
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
    expect(store.getComponent("pet-a", "PendingReaction")).toEqual(firstReaction);
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toEqual(firstDecision);
  });

  it("does not write PendingReaction for a climbing entity", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 400 } },
          { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
          { type: "IntentState" as const, intent: "active" as const },
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: { x: 100, y: 280 } },
          { type: "ClimbingState" as const },
        ],
      },
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual({ x: 100, y: 280 });
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("expires the collision claim as soon as overlap ends", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("collision");

    store.setComponent("pet-b", { type: "Transform", position: { x: 500, y: 500 } });
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
          { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
          { type: "IntentState" as const, intent: "idle" as const },
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
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

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("collision");
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
  });
});

// ── Phase 4: Reaction latency + decision + planning ────────────────────────

describe("Phase 4 — collision reaction latency and personality-shaped response", () => {
  /**
   * Build a store where pet-a has a PendingReaction already set and a matching
   * (already-expired) collision claim, simulating the state at reactsAt.
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
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
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
    ]);
  }

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
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
          {
            type: "Personality" as const,
            openness: 0.5, conscientiousness: 0.4,
            extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5,
          },
          {
            type: "Perception" as const,
            userAnchor: null, nearbyPets: [], nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "PendingReaction" as const,
            source: "collision" as const, triggeredAt: 1000, reactsAt,
            context: { otherPosition: { x: 200, y: 500 } },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "collision" as const, decidedAt: 1000, expiresAt: reactsAt,
            reason: "entity overlap", lastAutonomousReason: null, lastAutonomousAt: null,
          },
        ],
      },
    ]);

    // Tick with now = 1300 (< reactsAt 1400) — claim still active
    runBehaviorDecisionSystem(store, createManualClock(1300), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "PendingReaction")).toBeDefined();
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("at reactsAt, Decision emits a collision-* token and removes PendingReaction", () => {
    // now = reactsAt = 1400 → claim expired → reactive pool fires
    const store = makeReactionStore(0.5, 0.5, 0.5);
    runBehaviorDecisionSystem(store, createManualClock(1400), createSeededRandom(1), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toMatch(/^collision-/);
    expect(token?.consumed).toBe(false);
    expect(store.getComponent("pet", "PendingReaction")).toBeUndefined();
  });

  it("high-N low-A pet selects collision-flee at reactsAt (seed 1)", () => {
    // N=0.9, A=0.1: scoreFleeFromPet = 0.2+0.9*0.7-0.1*0.5 = 0.78 (dominant)
    const store = makeReactionStore(0.5, 0.9, 0.1);
    runBehaviorDecisionSystem(store, createManualClock(1400), createSeededRandom(1), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("collision-flee");
  });

  it("high-E high-A low-N pet selects collision-engage at reactsAt (seed 1)", () => {
    // E=0.9, A=0.9, N=0.1: scoreCollisionEngage = 0.2+0.9*0.5+0.9*0.5-0.1*0.4 = 1.06 (dominant)
    const store = makeReactionStore(0.9, 0.1, 0.9);
    runBehaviorDecisionSystem(store, createManualClock(1400), createSeededRandom(1), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("collision-engage");
  });

  it("collision-flee Planning: MotionTarget points away from otherPosition", () => {
    // Pet at (100,500), other at (200,500) → flee direction = (-1,0) → target ≈ (4,500) clamped to (48,500)
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null, nearbyPets: [], nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-flee" as const, decidedAt: 0, consumed: false,
            targetPosition: { x: 48, y: 500 }, // pre-computed flee position
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetPosition).toEqual({ x: 48, y: 500 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("collision-engage Planning: MotionTarget points toward otherPosition", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null, nearbyPets: [], nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-engage" as const, decidedAt: 0, consumed: false,
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
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null, nearbyPets: [], nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-avoid" as const, decidedAt: 0, consumed: false,
            targetPosition: { x: 100, y: 404 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({ x: 100, y: 404 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("collision-unfazed Planning: moves to a wander-near position and resumes", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 500 } },
          { type: "IntentState" as const, intent: "idle" as const },
          { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null, nearbyPets: [], nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-unfazed" as const, decidedAt: 0, consumed: false,
            targetPosition: { x: 150, y: 480 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({ x: 150, y: 480 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });
});
