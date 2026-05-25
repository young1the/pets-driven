import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runMotionTargetSystem } from "@/features/movement/systems";

describe("motion target system", () => {
  it("falls back to the user anchor position when seeking pet has no Transform", () => {
    // Without Transform we cannot compute a stop-short target — fall back to
    // the anchor itself rather than emitting null.
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "IntentState", intent: "seek" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: 300 },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runMotionTargetSystem(store, { next: () => 0.5 }, { width: 960, height: 540 });

    const motion = store.getComponent("pet-a", "MotionTarget");
    expect(motion?.targetEntityId).toBe("user-anchor");
    expect(motion?.targetPosition).toEqual({ x: 480, y: 500 });
  });

  // Regression: pets used to walk onto the exact anchor and pile up there
  // during the first ~800 frames of the demo (everyone seeks-user simultaneously).
  // The seek target now stops 80 px short on the pet's side of the anchor.
  it("seek-user target stops 80 px short of the anchor on the pet's side", () => {
    // Pet at (600, 500), anchor at (480, 500). dx=120 → target (480+80, 500) = (560, 500).
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 600, y: 500 } },
          { type: "IntentState", intent: "seek" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: 120 },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runMotionTargetSystem(store, { next: () => 0.5 }, { width: 960, height: 540 });

    const motion = store.getComponent("pet-a", "MotionTarget");
    expect(motion?.targetEntityId).toBe("user-anchor");
    expect(motion?.targetPosition?.x).toBeCloseTo(560, 0);
    expect(motion?.targetPosition?.y).toBeCloseTo(500, 0);
    // Critically: target must NOT be on the anchor itself.
    expect(motion?.targetPosition).not.toEqual({ x: 480, y: 500 });
  });

  it("seek-user holds position when pet is already within stop distance", () => {
    // Pet at (520, 500), anchor at (480, 500). dist=40 < 80 → stay put.
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 520, y: 500 } },
          { type: "IntentState", intent: "seek" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: 40 },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "seek" as const },
          },
        ],
      },
    ]);

    runMotionTargetSystem(store, { next: () => 0.5 }, { width: 960, height: 540 });

    const motion = store.getComponent("pet-a", "MotionTarget");
    expect(motion?.targetPosition).toEqual({ x: 520, y: 500 });
  });

  it("clears entity target and picks a waypoint when pet stops seeking", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "MotionTarget", targetEntityId: "user-anchor", targetPosition: null },
      ],
    }]);

    runMotionTargetSystem(store, { next: () => 0.5 }, { width: 960, height: 540 });

    const motion = store.getComponent("pet-a", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toEqual({ x: 480, y: 270 });
  });

  it("chooses deterministic waypoints by random values", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
      ],
    }]);
    const values = [0.25, 0.25];

    runMotionTargetSystem(store, { next: () => values.shift() ?? 0 }, { width: 960, height: 540 });

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual({ x: 264, y: 159 });
  });

  it("does not overwrite an existing target position", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "IntentState", intent: "idle" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 300, y: 200 } },
      ],
    }]);

    runMotionTargetSystem(store, { next: () => 0.5 }, { width: 960, height: 540 });

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toEqual({ x: 300, y: 200 });
  });
});
