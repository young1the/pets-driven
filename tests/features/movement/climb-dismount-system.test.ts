import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runClimbDismountSystem } from "@/features/movement/systems";
import type { SimulationComponent } from "@/core/components";

function makeCompletedClimber(extraComponents: SimulationComponent[] = []) {
  return createComponentStore([{
    id: "pet-a",
    components: [
      { type: "ClimbingState" as const },
      { type: "CanWalk" as const, speed: 0.01 },
      { type: "CanWallClimb" as const, speed: 1.1 },
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

    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "ClimbIntentState")?.phase).toBe("attached");
  });

  it("uses jump dismount state when the pet has the dismount capability", () => {
    const store = makeCompletedClimber([
      { type: "CanJump" as const, impulse: 0.009 },
      { type: "JumpActionState" as const, phase: "ready", cooldownMs: 0 },
      { type: "ClimbDismountState" as const, phase: "ready", cooldownMs: 0 },
    ]);

    runClimbDismountSystem(store, 16);

    expect(store.getComponent("pet-a", "ClimbingState")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingState")).toBeDefined();
    expect(store.getComponent("pet-a", "JumpActionState")?.phase).toBe("falling");
    expect(store.getComponent("pet-a", "ClimbDismountState")?.phase).toBe("airborne");
  });

  it("keeps climbing while a climb target is still active", () => {
    const store = makeCompletedClimber();
    store.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 280, y: 120 },
    });

    runClimbDismountSystem(store, 16);

    expect(store.getComponent("pet-a", "ClimbingState")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingState")).toBeUndefined();
  });
});
