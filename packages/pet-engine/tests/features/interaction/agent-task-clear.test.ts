import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

describe("user interaction clears AgentTaskState to idle", () => {
  it("removes AgentTaskState when a controllable pet is pressed", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "CanControl", speed: 1.4 },
          { type: "AgentTaskState", status: "waiting", since: 0 },
          {
            type: "AgentChannelState",
            source: "agent-task",
            status: "waiting",
            label: "Waiting",
            message: null,
            updatedAt: 0,
            expiresAt: null,
          },
        ],
      },
      {
        id: "user-interaction",
        components: [{ type: "KeyboardControlTarget", entityId: null }],
      },
    ]);

    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 0, y: 0 },
    });

    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
  });

  it("removes AgentTaskState when a draggable pet is pressed", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 100, y: 100 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "CanDrag" },
          { type: "AgentTaskState", status: "waiting", since: 0 },
        ],
      },
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: null },
          { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
        ],
      },
    ]);

    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 100, y: 100 },
    });

    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
  });
});
