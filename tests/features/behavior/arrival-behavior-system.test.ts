import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runArrivalBehaviorSystem } from "@/features/behavior/systems";

describe("arrival behavior system", () => {
  it("clears position target when walk pet arrives within x radius", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "Transform", position: { x: 108, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 100, y: 100 } },
        { type: "WandersOnArrival", arrivalRadius: 16 },
      ],
    }]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("does not clear position target when outside x radius", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "Transform", position: { x: 200, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 100, y: 100 } },
        { type: "WandersOnArrival", arrivalRadius: 16 },
      ],
    }]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).not.toBeNull();
  });

  it("keeps approach target while a pet is climbing toward a surface", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "Transform", position: { x: 124, y: 500 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 500 } },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        { type: "ClimbIntentState", phase: "approaching", surfaceEntityId: "wall-1", targetY: 120 },
      ],
    }]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual({ x: 120, y: 500 });
  });

  it("clears position target when climb pet arrives within y radius", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "ClimbingState" },
        { type: "Transform", position: { x: 280, y: 108 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 700, y: 100 } },
        { type: "WandersOnArrival", arrivalRadius: 16 },
      ],
    }]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("switches seeking pet to idle on arriving at user anchor", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "seek" as const },
          { type: "Transform", position: { x: 108, y: 100 } },
          { type: "MotionTarget", targetEntityId: "user-anchor", targetPosition: { x: 100, y: 100 } },
          { type: "WandersOnArrival", arrivalRadius: 16 },
        ],
      },
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 100, y: 100 } },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBeNull();
  });

  it("does not switch to idle when seeking pet is far from user anchor", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "seek" as const },
          { type: "Transform", position: { x: 200, y: 100 } },
          { type: "MotionTarget", targetEntityId: "user-anchor", targetPosition: null },
          { type: "WandersOnArrival", arrivalRadius: 16 },
        ],
      },
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 100, y: 100 } },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("seek");
  });
});
