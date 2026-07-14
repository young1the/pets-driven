import { describe, expect, it, vi } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runFlightSystem } from "@pets-driven/pet-engine/features/movement/systems";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";

function makeFlyer(gravityScale: number, hoverStrength: number) {
  return createComponentStore([
    {
      id: "pet-a",
      components: [
        { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 32 },
        { type: "FlyingTag" },
        { type: "CanFly" as const, gravityScale, hoverStrength },
      ],
    },
  ]);
}

function makePhysicsMock() {
  return { setGravityScale: vi.fn(), applyForce: vi.fn() } as unknown as MatterPhysicsWorld;
}

describe("flight system", () => {
  it("sets gravity scale from CanFly component", () => {
    const store = makeFlyer(0.1, 0);
    const physics = makePhysicsMock();
    runFlightSystem(store, physics);
    expect(physics.setGravityScale).toHaveBeenCalledWith("pet-a", 0.1);
  });

  it("applies upward hover force when hoverStrength is positive", () => {
    const store = makeFlyer(0.1, 0.005);
    const physics = makePhysicsMock();
    runFlightSystem(store, physics);
    expect(physics.applyForce).toHaveBeenCalledWith("pet-a", { x: 0, y: -0.005 });
  });

  it("does not apply hover force when hoverStrength is zero", () => {
    const store = makeFlyer(0.1, 0);
    const physics = makePhysicsMock();
    runFlightSystem(store, physics);
    expect(physics.applyForce).not.toHaveBeenCalled();
  });
});
