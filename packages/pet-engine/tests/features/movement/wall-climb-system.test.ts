import { describe, expect, it, vi } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runWallClimbSystem } from "@pets-driven/pet-engine/features/movement/systems";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";

function makeClimber(posY: number, targetY: number | null) {
  return createComponentStore([
    {
      id: "pet-a",
      components: [
        { type: "Transform" as const, position: { x: 100, y: posY } },
        { type: "ClimbingTag" },
        { type: "CanWallClimb" as const, velocity: 0.004 },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: targetY !== null ? { x: 100, y: targetY } : null,
        },
        {
          type: "ContactState" as const,
          grounded: false,
          climbableSurfaceId: "wall-1",
          climbableSurfacePosition: { x: 100, y: 0 },
        },
      ],
    },
  ]);
}

function makePhysicsMock() {
  return { setVelocity: vi.fn() } as unknown as MatterPhysicsWorld;
}

describe("wall climb system", () => {
  it("sets upward velocity when target is above", () => {
    const store = makeClimber(500, 100);
    const physics = makePhysicsMock();
    runWallClimbSystem(store, physics);
    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0, y: -0.004 });
  });

  it("sets downward velocity when target is below", () => {
    const store = makeClimber(100, 500);
    const physics = makePhysicsMock();
    runWallClimbSystem(store, physics);
    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0, y: 0.004 });
  });

  it("stops velocity when within arrival radius of target", () => {
    const store = makeClimber(100, 108); // 8px gap, inside 16px radius
    const physics = makePhysicsMock();
    runWallClimbSystem(store, physics);
    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0, y: 0 });
  });

  it("does nothing when there is no motion target", () => {
    const store = makeClimber(100, null);
    const physics = makePhysicsMock();
    runWallClimbSystem(store, physics);
    expect(physics.setVelocity).not.toHaveBeenCalled();
  });
});
