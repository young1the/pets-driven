import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runSteeringForceSystem } from "@pets-driven/pet-engine/features/movement/systems";
import type { Force } from "@pets-driven/pet-engine/features/physics/systems";

function makeFlyer(
  mode: "stand" | "pursue" | "arrive",
  targetX: number | null,
  targetY: number | null,
) {
  return createComponentStore([
    {
      id: "pet-a",
      components: [
        { type: "Transform" as const, position: { x: 100, y: 100 } },
        { type: "FlyingTag" },
        {
          type: "MovementProfile" as const,
          standForce: 0.001,
          pursueForce: 0.002,
          arriveForce: 0.003,
        },
        { type: "Steering" as const, mode },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: targetX !== null ? { x: targetX, y: targetY! } : null,
        },
      ],
    },
  ]);
}

describe("steering force system", () => {
  it("emits zero force when there is no target", () => {
    const store = makeFlyer("stand", null, null);
    const forceGroups: Force[][] = [];
    runSteeringForceSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: 0, y: 0 });
  });

  it("emits zero force when at target within arrival radius", () => {
    const store = makeFlyer("stand", 108, 100); // 8px away — inside 16px radius
    const forceGroups: Force[][] = [];
    runSteeringForceSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: 0, y: 0 });
  });

  it("uses arriveForce when the steering mode is arrive and target is far", () => {
    const store = makeFlyer("arrive", 1100, 100); // far right, dy=0 so all force is on x
    const forceGroups: Force[][] = [];
    runSteeringForceSystem(store, forceGroups);
    expect(forceGroups.flat()[0]?.x).toBeCloseTo(0.003);
  });

  it("uses standForce when the steering mode is stand and target is far", () => {
    const store = makeFlyer("stand", 1100, 100);
    const forceGroups: Force[][] = [];
    runSteeringForceSystem(store, forceGroups);
    expect(forceGroups.flat()[0]?.x).toBeCloseTo(0.001);
  });
});
