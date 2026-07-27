import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runTaskMovementHoldSystem } from "@pets-driven/pet-engine/features/behavior/agent-task-systems";
import { describe, expect, it } from "vitest";

function makeStore(held: boolean) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentTaskState", status: "waiting" as const, since: 0 },
        ...(held ? [{ type: "TaskMovementHold" as const, since: 0 }] : []),
        {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 9, y: 9 },
        },
      ],
    },
  ]);
}

describe("runTaskMovementHoldSystem freezes by hold component", () => {
  it("freezes a held pet (clears motion target)", () => {
    const store = makeStore(true);
    const velocities: Array<{ x: number; y: number }> = [];
    runTaskMovementHoldSystem(store, {
      setVelocity: (_id, v) => velocities.push({ x: v.x ?? 0, y: v.y ?? 0 }),
    });
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("does not freeze a released pet whose status still reads waiting", () => {
    const store = makeStore(false);
    runTaskMovementHoldSystem(store, { setVelocity: () => {} });
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 9,
      y: 9,
    });
  });
});
