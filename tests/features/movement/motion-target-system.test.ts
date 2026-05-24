import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runMotionTargetSystem } from "@/features/movement/systems";

describe("motion target system", () => {
  it("targets the user anchor for seeking pets", () => {
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
