import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runWalkSystem } from "@pets-driven/pet-engine/features/movement/systems";
import type { Force } from "@pets-driven/pet-engine/features/physics/systems";
import { describe, expect, it } from "vitest";

function makeStore(held: boolean) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentTaskState", status: "waiting" as const, since: 0 },
        ...(held ? [{ type: "TaskMovementHold" as const, since: 0 }] : []),
        { type: "Transform", position: { x: 100, y: 100 } },
        { type: "WalkingTag" },
        {
          type: "ContactState",
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        { type: "CanWalk", force: 0.001 },
        {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 300, y: 100 },
        },
      ],
    },
  ]);
}

describe("task movement hold", () => {
  it("blocks locomotion while the hold component is present", () => {
    const forceGroups: Force[][] = [];

    runWalkSystem(makeStore(true), forceGroups);

    expect(forceGroups).toHaveLength(0);
  });

  it("does not infer a hold from the reported task status", () => {
    const forceGroups: Force[][] = [];

    runWalkSystem(makeStore(false), forceGroups);

    expect(forceGroups.flat()).toContainEqual({ id: "pet", x: 0.001, y: 0 });
  });
});
