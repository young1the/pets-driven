import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runWalkSystem } from "@/features/movement/systems";
import type { Force } from "@/features/physics/systems";

function makeWalker(
  posX: number,
  targetX: number | null,
  grounded: boolean,
  avoidanceWaypoint: { x: number; y: number } | null = null,
) {
  return createComponentStore([{
    id: "pet-a",
    components: [
      { type: "Transform" as const, position: { x: posX, y: 500 } },
      { type: "WalkingTag" },
      { type: "ContactState" as const, grounded, climbableSurfaceId: null, climbableSurfacePosition: null },
      { type: "CanWalk" as const, force: 0.001 },
      { type: "MotionTarget" as const, targetEntityId: null, targetPosition: targetX !== null ? { x: targetX, y: 500 } : null },
      { type: "NavigationState" as const, avoidanceWaypoint },
    ],
  }]);
}

describe("walk system", () => {
  it("applies rightward force when target is to the right", () => {
    const store = makeWalker(100, 300, true);
    const forceGroups: Force[][] = [];
    runWalkSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: 0.001, y: 0 });
  });

  it("applies leftward force when target is to the left", () => {
    const store = makeWalker(100, -100, true);
    const forceGroups: Force[][] = [];
    runWalkSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: -0.001, y: 0 });
  });

  it("produces no force when not grounded", () => {
    const store = makeWalker(100, 300, false);
    const forceGroups: Force[][] = [];
    runWalkSystem(store, forceGroups);
    expect(forceGroups).toHaveLength(0);
  });

  it("produces no force when already within arrival radius", () => {
    const store = makeWalker(100, 108, true); // 8px gap, inside the 16px radius
    const forceGroups: Force[][] = [];
    runWalkSystem(store, forceGroups);
    expect(forceGroups).toHaveLength(0);
  });

  it("prefers avoidance waypoint over motion target when both are set", () => {
    // target is to the right, waypoint is to the left
    const store = makeWalker(100, 300, true, { x: -100, y: 500 });
    const forceGroups: Force[][] = [];
    runWalkSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: -0.001, y: 0 });
  });
});
