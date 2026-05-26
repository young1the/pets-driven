import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runJumpSystem } from "@/features/movement/systems";
import type { Force } from "@/features/physics/systems";

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
  it("transitions requested → rising and applies upward force when grounded", () => {
    const store = makeJumper("requested", true);
    const forces: Force[][] = [];

    runJumpSystem(store, 16, forces);

    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("rising");
    expect(forces.flat()).toContainEqual({ id: "pet-a", x: 0, y: -0.009 });
  });

  it("transitions requested → falling when not grounded", () => {
    const store = makeJumper("requested", false);
    const forces: Force[][] = [];

    runJumpSystem(store, 16, forces);

    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("falling");
    expect(forces).toHaveLength(0);
  });

  it("transitions rising → falling once airborne", () => {
    const store = makeJumper("rising", false);

    runJumpSystem(store, 16, []);

    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("falling");
  });

  it("transitions falling → landingCooldown on landing", () => {
    const store = makeJumper("falling", true);

    runJumpSystem(store, 16, []);

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

    runJumpSystem(store, 16, []);

    expect(store.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });
});
