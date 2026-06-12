import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runArrivalBehaviorSystem } from "@/features/behavior/systems";
import { createManualClock } from "@/shared/time/manual-clock";

describe("arrival behavior system", () => {
  it("clears position target and resets intent to idle when walk pet arrives within x radius", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "active" as const },
        { type: "Transform", position: { x: 108, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 100, y: 100 } },
        { type: "WandersOnArrival", arrivalRadius: 16 },
      ],
    }]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
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
        { type: "ClimbingTag" },
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
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 100, y: 100 }, distance: 8 },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBeNull();
  });

  it("switches seeking walk pet to idle even when anchor is at a different y", () => {
    // Pet has settled on the ground (y=521); anchor sits above (y=500).
    // 2D dist = hypot(8, 21) ≈ 22.4 which exceeds arrivalRadius(16), but |dx|=8
    // which is within it — walking arrival must use horizontal distance only.
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "seek" as const },
          { type: "Transform", position: { x: 108, y: 521 } },
          { type: "MotionTarget", targetEntityId: "user-anchor", targetPosition: { x: 100, y: 500 } },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 100, y: 500 }, distance: Math.hypot(8, 21) },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBeNull();
  });

  it("switches seeking walk pet to idle when it reaches the resolved stop target", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "seek" as const },
          { type: "Transform", position: { x: 452, y: 521 } },
          { type: "MotionTarget", targetEntityId: "user-anchor", targetPosition: { x: 440, y: 500 } },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 360, y: 500 }, distance: Math.hypot(92, 21) },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: true, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBeNull();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
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
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 100, y: 100 }, distance: 100 },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store);

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("seek");
  });

  it("marks approach-pet successful when it catches the target pet", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "active" as const },
          { type: "Transform", position: { x: 100, y: 100 } },
          { type: "MotionTarget", targetEntityId: "pet-b", targetPosition: { x: 140, y: 100 } },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [{ id: "pet-b", position: { x: 140, y: 100 }, distance: 40 }],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "active" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "approach-pet" as const,
            decidedAt: 1000,
            consumed: true,
            targetEntityId: "pet-b",
            targetPosition: { x: 140, y: 100 },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous" as const,
            decidedAt: 1800,
            expiresAt: 2300,
            reason: "approach-pet",
            lastAutonomousReason: "approach-pet",
            lastAutonomousAt: 1000,
          },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store, createManualClock(1800));

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBeNull();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.reason).toBe("approach-pet-success");
  });

  it("abandons approach-pet after the chase time limit", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "active" as const },
          { type: "Transform", position: { x: 100, y: 100 } },
          { type: "MotionTarget", targetEntityId: "pet-b", targetPosition: { x: 500, y: 100 } },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [{ id: "pet-b", position: { x: 500, y: 100 }, distance: 400 }],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "active" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "approach-pet" as const,
            decidedAt: 1000,
            consumed: true,
            targetEntityId: "pet-b",
            targetPosition: { x: 500, y: 100 },
          },
          {
            type: "BehaviorDecisionState" as const,
            source: "autonomous" as const,
            decidedAt: 5000,
            expiresAt: 5500,
            reason: "approach-pet",
            lastAutonomousReason: "approach-pet",
            lastAutonomousAt: 1000,
          },
        ],
      },
    ]);

    runArrivalBehaviorSystem(store, createManualClock(5101));

    expect(store.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetEntityId).toBeNull();
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt).toBeLessThanOrEqual(5101);
  });
});
