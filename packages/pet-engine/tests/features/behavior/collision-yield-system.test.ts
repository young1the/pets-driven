import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runCollisionYieldSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

function walker(targetX: number) {
  return {
    id: "walker",
    components: [
      { type: "Transform" as const, position: { x: 468, y: 500 } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
      { type: "PetIdentity" as const, name: "walker" },
      { type: "IntentState" as const, intent: "active" as const },
      {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: targetX, y: 500 },
      },
      { type: "WalkingTag" as const },
      {
        type: "Personality" as const,
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
    ],
  };
}

function blocker(x: number) {
  return {
    id: "blocker",
    components: [
      { type: "Transform" as const, position: { x, y: 500 } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
      { type: "PetIdentity" as const, name: "blocker" },
    ],
  };
}

const NO_RANDOM = { next: () => 0.5 };

describe("collision yield system (blocked-path yield)", () => {
  it("gives up a target after pressing against an in-the-way pet for ~900ms", () => {
    // Walker at 468 (right edge 484), blocker at 500 (left edge 484): pressing.
    const store = createComponentStore([walker(700), blocker(500)]);
    const clock = createManualClock(0);

    // Seed tick + two 500ms pressing ticks → blockedMs reaches 1000 ≥ 900.
    runCollisionYieldSystem(store, clock, 16, NO_RANDOM);
    clock.advanceBy(500);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).not.toBeNull();
    clock.advanceBy(500);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);

    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("walker", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("walker", "BlockedPathState")).toBeUndefined();
    expect(store.getComponent("walker", "BehaviorDecisionState")).toMatchObject({
      source: "autonomous",
      reason: "arrival-dwell",
    });
  });

  it("does not track a pet that is not pressing (gap too wide)", () => {
    const store = createComponentStore([walker(700), blocker(600)]);
    const clock = createManualClock(0);

    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);

    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).not.toBeNull();
    expect(store.getComponent("walker", "BlockedPathState")).toBeUndefined();
  });

  it("does not yield when the pressing pet is the destination, not an obstacle", () => {
    // Target sits at the blocker itself (approach-style): |dx| >= |targetDx|.
    const store = createComponentStore([walker(500), blocker(500)]);
    const clock = createManualClock(0);

    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);

    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).not.toBeNull();
  });

  it("leaves movement owned by a live claim alone (session chase, romp, hold)", () => {
    const store = createComponentStore([walker(700), blocker(500)]);
    const clock = createManualClock(0);
    store.setComponent("walker", {
      type: "BehaviorDecisionState",
      source: "social",
      decidedAt: 0,
      expiresAt: 1_000_000,
      reason: "session-chase",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    clock.advanceBy(500);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    clock.advanceBy(500);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);

    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).not.toBeNull();
    expect(store.getComponent("walker", "BehaviorDecisionState")?.reason).toBe(
      "session-chase",
    );
  });

  it("a new target resets the blocked timer", () => {
    const store = createComponentStore([walker(700), blocker(500)]);
    const clock = createManualClock(0);

    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM); // blockedMs 500

    store.setComponent("walker", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 650, y: 500 },
    });
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);

    expect(store.getComponent("walker", "BlockedPathState")).toMatchObject({
      targetX: 650,
      blockedMs: 0,
    });
    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).not.toBeNull();
  });
});

describe("collision yield — convoy pattern (bounce gaps)", () => {
  it("keeps accumulating blocked time across escape-force bounce gaps", () => {
    const store = createComponentStore([walker(700), blocker(500)]);
    const clock = createManualClock(0);

    // Pressing 500ms.
    runCollisionYieldSystem(store, clock, 16, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    expect(store.getComponent("walker", "BlockedPathState")?.blockedMs).toBe(500);

    // Bounced ~6px back: gap opens briefly — decay, not reset.
    store.setComponent("blocker", {
      type: "Transform",
      position: { x: 600, y: 500 },
    });
    runCollisionYieldSystem(store, clock, 100, NO_RANDOM);
    expect(store.getComponent("walker", "BlockedPathState")?.blockedMs).toBe(300);

    // Caught back up: pressing again crosses the threshold and yields.
    store.setComponent("blocker", {
      type: "Transform",
      position: { x: 500, y: 500 },
    });
    clock.advanceBy(1_000);
    runCollisionYieldSystem(store, clock, 500, NO_RANDOM);
    runCollisionYieldSystem(store, clock, 200, NO_RANDOM);

    expect(store.getComponent("walker", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("walker", "BehaviorDecisionState")?.reason).toBe(
      "arrival-dwell",
    );
  });
});
