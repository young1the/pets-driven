import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { createManualClock } from "@/shared/time/manual-clock";
import { runCollisionBehaviorSystem } from "@/features/behavior/systems";

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

describe("collision behavior system", () => {
  it("sets avoidance target and claims decision when entities overlap", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).not.toBeNull();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("collision");
  });

  it("does not react when entities are far apart", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 500, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

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

    // pet-a has an agent-event claim (higher priority than collision) — should not be overwritten
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("agent-event");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBe("user-anchor");
  });

  it("does not refresh an active collision claim every frame while overlap persists", () => {
    const clock = createManualClock(1000);
    const store = createComponentStore([
      makePet("pet-a", 100, "idle"),
      makePet("pet-b", 110, "idle"),
    ]);

    runCollisionBehaviorSystem(store, BOUNDS, clock);

    const firstDecision = store.getComponent("pet-a", "BehaviorDecisionState");
    const firstTarget = store.getComponent("pet-a", "MotionTarget")?.targetPosition;
    expect(firstDecision?.source).toBe("collision");

    clock.advanceBy(16);
    runCollisionBehaviorSystem(store, BOUNDS, clock);

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toEqual(firstDecision);
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual(firstTarget);
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
  });
});
