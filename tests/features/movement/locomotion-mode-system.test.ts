import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runLocomotionModeSystem } from "@/features/movement/systems";

describe("locomotion mode system", () => {
  it("switches to climb when touching a climbable surface with CanWallClimb", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingState" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", speed: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "ClimbingState")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingState")).toBeUndefined();
  });

  it("does not switch to climb when entity has no CanWallClimb", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingState" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
  });

  it("does not switch to climb when walking toward a different target x", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingState" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-280", climbableSurfacePosition: { x: 280, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 120 } },
        { type: "CanWallClimb", speed: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
  });

  it("switches to climb when contacted surface x matches target x", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingState" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-120", climbableSurfacePosition: { x: 120, y: 500 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 120 } },
        { type: "CanWallClimb", speed: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "ClimbingState")).toBeDefined();
  });

  it("reverts to walk when climbing but surface is gone", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "ClimbingState" },
        { type: "ContactState", grounded: false, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", speed: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
  });

  it("does not revert flying entities when there is no surface", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "FlyingState" },
        { type: "ContactState", grounded: false, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "FlyingState")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingState")).toBeUndefined();
  });

  it("does not re-enter climb while ClimbDismountState is airborne", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingState" },
        { type: "ContactState", grounded: false, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", speed: 0.004 },
        { type: "ClimbDismountState", phase: "airborne", cooldownMs: 0 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
  });

  it("does not re-enter climb while ClimbDismountState cooldown is active", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingState" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", speed: 0.004 },
        { type: "ClimbDismountState", phase: "coolingDown", cooldownMs: 500 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
  });
});
