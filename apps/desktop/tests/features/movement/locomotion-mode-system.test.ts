import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runLocomotionModeSystem } from "@/features/movement/systems";

describe("locomotion mode system", () => {
  it("starts climb action without replacing walking locomotion", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", velocity: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "ClimbingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
  });

  it("does not switch to climb when entity has no CanWallClimb", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
  });

  it("does not switch to climb when walking toward a different target x", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-280", climbableSurfacePosition: { x: 280, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 120 } },
        { type: "CanWallClimb", velocity: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
  });

  it("switches to climb when contacted surface x matches target x", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-120", climbableSurfacePosition: { x: 120, y: 500 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 120 } },
        { type: "CanWallClimb", velocity: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "ClimbingTag")).toBeDefined();
  });

  it("allows only one pet to enter the same climbable surface", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "WalkingTag" },
          { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 120, y: 500 } },
          { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 120 } },
          { type: "CanWallClimb", velocity: 0.004 },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "WalkingTag" },
          { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 120, y: 500 } },
          { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 120, y: 140 } },
          { type: "CanWallClimb", velocity: 0.004 },
        ],
      },
    ]);

    runLocomotionModeSystem(store);

    const climbingCount = ["pet-a", "pet-b"].filter((id) =>
      store.getComponent(id, "ClimbingTag"),
    ).length;
    expect(climbingCount).toBe(1);
  });

  it("reverts to walk when climbing but surface is gone", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "ClimbingTag" },
        { type: "ContactState", grounded: false, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", velocity: 0.004 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
  });

  it("does not revert flying entities when there is no surface", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "FlyingTag" },
        { type: "ContactState", grounded: false, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "FlyingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeUndefined();
  });

  it("does not re-enter climb when ClimbIntentState phase is attached (stale after dismount)", () => {
    // After a completed climb the intent remains "attached". Without this guard
    // canEnterClimb would return true the moment the cooldown expires, causing
    // the pet to immediately restart the same climb indefinitely.
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", velocity: 0.004 },
        { type: "ClimbDismountState", phase: "ready", cooldownMs: 0 },
        { type: "ClimbIntentState", phase: "attached", surfaceEntityId: "wall-1", targetY: 120 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
  });

  it("does not re-enter climb while ClimbDismountState is airborne", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: false, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", velocity: 0.004 },
        { type: "ClimbDismountState", phase: "airborne", cooldownMs: 0 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
  });

  it("does not re-enter climb while ClimbDismountState cooldown is active", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        { type: "WalkingTag" },
        { type: "ContactState", grounded: true, climbableSurfaceId: "wall-1", climbableSurfacePosition: { x: 100, y: 100 } },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "CanWallClimb", velocity: 0.004 },
        { type: "ClimbDismountState", phase: "coolingDown", cooldownMs: 500 },
      ],
    }]);

    runLocomotionModeSystem(store);

    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
  });
});
