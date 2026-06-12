import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runJumpSystem } from "@/features/movement/systems";
import type { Force } from "@/features/physics/systems";
import type { RandomSource } from "@/shared/random/seeded-random";

function makeJumper(phase: "ready" | "requested" | "rising" | "falling" | "landingCooldown", grounded: boolean) {
  return createComponentStore([{
    id: "pet-a",
    components: [
      { type: "WalkingTag" },
      { type: "ContactState", grounded, climbableSurfaceId: null, climbableSurfacePosition: null },
      { type: "CanJump", impulse: 0.009 },
      { type: "JumpActionState", phase, cooldownMs: 0 },
    ],
  }]);
}

describe("jump system", () => {
  const midRandom: RandomSource = { next: () => 0.5 };

  it("transitions requested → rising and applies upward force when grounded", () => {
    const store = makeJumper("requested", true);
    const forces: Force[][] = [];

    runJumpSystem(store, 16, forces, midRandom);

    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("rising");
    expect(forces.flat()).toContainEqual({ id: "pet-a", x: 0, y: -0.009 });
  });

  it("applies a randomized forward impulse toward the motion target when jumping", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "Transform", position: { x: 100, y: 0 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 200, y: 0 } },
        { type: "ContactState", grounded: true, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "CanJump", impulse: 0.009, forwardImpulse: { min: 0.002, max: 0.006 } },
        { type: "JumpActionState", phase: "requested", cooldownMs: 0 },
      ],
    }]);
    const forces: Force[][] = [];

    runJumpSystem(store, 16, forces, midRandom);

    expect(forces.flat()).toContainEqual({ id: "pet-a", x: 0.004, y: -0.009 });
  });

  it("applies the forward impulse to the left when the motion target is leftward", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "Transform", position: { x: 100, y: 0 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 50, y: 0 } },
        { type: "ContactState", grounded: true, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "CanJump", impulse: 0.009, forwardImpulse: { min: 0.002, max: 0.006 } },
        { type: "JumpActionState", phase: "requested", cooldownMs: 0 },
      ],
    }]);
    const forces: Force[][] = [];

    runJumpSystem(store, 16, forces, midRandom);

    expect(forces.flat()).toContainEqual({ id: "pet-a", x: -0.004, y: -0.009 });
  });

  it("transitions requested → falling when not grounded", () => {
    const store = makeJumper("requested", false);
    const forces: Force[][] = [];

    runJumpSystem(store, 16, forces, midRandom);

    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("falling");
    expect(forces).toHaveLength(0);
  });

  it("transitions rising → falling once airborne", () => {
    const store = makeJumper("rising", false);

    runJumpSystem(store, 16, [], midRandom);

    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("falling");
  });

  it("transitions falling → landingCooldown on landing", () => {
    const store = makeJumper("falling", true);

    runJumpSystem(store, 16, [], midRandom);

    const state = store.getComponent("pet-a", "JumpActionState");
    expect(state?.phase).toBe("landingCooldown");
    expect(state?.cooldownMs).toBeGreaterThan(0);
  });

  it("counts down landingCooldown and removes the completed jump action", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "CanJump", impulse: 0.009 },
        { type: "JumpActionState", phase: "landingCooldown", cooldownMs: 16 },
      ],
    }]);

    runJumpSystem(store, 16, [], midRandom);

    expect(store.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });
});
