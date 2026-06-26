import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentEventHoldSystem } from "@pets-driven/pet-engine/features/behavior/systems";

function makeStore(status: "working" | "waiting") {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentTaskState", status, since: 0 },
        {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 9, y: 9 },
        },
      ],
    },
  ]);
}

describe("runAgentEventHoldSystem freezes by status", () => {
  it("freezes a waiting pet (clears motion target)", () => {
    const store = makeStore("waiting");
    const velocities: Array<{ x: number; y: number }> = [];
    runAgentEventHoldSystem(store, {
      setVelocity: (_id, v) => velocities.push({ x: v.x ?? 0, y: v.y ?? 0 }),
    });
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).toBeNull();
  });

  it("does not freeze a working pet", () => {
    const store = makeStore("working");
    runAgentEventHoldSystem(store, { setVelocity: () => {} });
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 9,
      y: 9,
    });
  });
});
