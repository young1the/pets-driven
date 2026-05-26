import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runClimbDismountSystem } from "@/features/movement/systems";
import type { Component } from "@/core/components";

function makeCompletedClimber(extraComponents: Component[] = []) {
  return createComponentStore([{
    id: "pet-a",
    components: [
      { type: "ClimbingTag" as const },
      { type: "CanWalk" as const, force: 0.01 },
      { type: "CanWallClimb" as const, velocity: 1.1 },
      {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: "wall-1",
        climbableSurfacePosition: { x: 280, y: 200 },
      },
      { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
      { type: "ClimbIntentState" as const, phase: "attached", surfaceEntityId: "wall-1", targetY: 120 },
      ...extraComponents,
    ],
  }]);
}

describe("climb dismount system", () => {
  it("detaches a completed climb even without jump dismount components", () => {
    const store = makeCompletedClimber();

    runClimbDismountSystem(store, 16);

    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbIntentState")).toBeUndefined();
  });

  it("creates jump and dismount actions when a jump-capable pet detaches", () => {
    const store = makeCompletedClimber([
      { type: "CanJump" as const, impulse: 0.009 },
    ]);

    runClimbDismountSystem(store, 16);

    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("falling");
    expect(store.getComponent("pet-a", "ClimbDismountState")?.phase).toBe("airborne");
  });

  it("removes dismount state after landing cooldown completes", () => {
    const store = createComponentStore([{
      id: "pet-a",
      components: [
        {
          type: "ContactState" as const,
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        { type: "MotionTarget" as const, targetEntityId: null, targetPosition: null },
        { type: "ClimbDismountState" as const, phase: "coolingDown", cooldownMs: 16 },
      ],
    }]);

    runClimbDismountSystem(store, 16);

    expect(store.getComponent("pet-a", "ClimbDismountState")).toBeUndefined();
  });

  it("keeps climbing while a climb target is still active", () => {
    const store = makeCompletedClimber();
    store.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 280, y: 120 },
    });

    runClimbDismountSystem(store, 16);

    expect(store.getComponent("pet-a", "ClimbingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeUndefined();
  });
});
