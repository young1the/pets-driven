import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

function pressAt(x: number, y: number) {
  const events = createWorldEventQueue();
  events.push({
    kind: "pointer",
    type: "pointer.down",
    pointerId: 1,
    at: 0,
    position: { x, y },
  });
  return events;
}

describe("user interaction releases the agent task state", () => {
  it("clears the hold, task state, and channel badge when a controllable pet is pressed", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "CanControl", speed: 1.4 },
          { type: "AgentTaskState", status: "waiting", since: 0 },
          { type: "TaskMovementHold", since: 0 },
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

    runUserInteractionBehaviorSystem(
      components,
      pressAt(0, 0),
      createManualClock(0),
    );

    expect(components.getComponent("pet", "TaskMovementHold")).toBeUndefined();
    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
  });

  it("clears the hold and task state when a draggable pet is pressed", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 100, y: 100 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "CanDrag" },
          { type: "AgentTaskState", status: "failed", since: 0 },
          { type: "TaskMovementHold", since: 0 },
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

    runUserInteractionBehaviorSystem(
      components,
      pressAt(100, 100),
      createManualClock(0),
    );

    expect(components.getComponent("pet", "TaskMovementHold")).toBeUndefined();
    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
  });

  it("keeps a live working status — pressing must not erase a running agent", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "CanControl", speed: 1.4 },
          { type: "AgentTaskState", status: "working", since: 0 },
          {
            type: "AgentChannelState",
            source: "agent-task",
            status: "working",
            label: "Working",
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

    runUserInteractionBehaviorSystem(
      components,
      pressAt(0, 0),
      createManualClock(0),
    );

    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe(
      "working",
    );
    expect(components.getComponent("pet", "AgentChannelState")?.label).toBe(
      "Working",
    );
  });

  it("leaves a non-agent-task channel badge in place when clearing", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "CanControl", speed: 1.4 },
          { type: "AgentTaskState", status: "completed", since: 0 },
          { type: "TaskMovementHold", since: 0 },
          {
            type: "AgentChannelState",
            source: "agent-hook",
            status: "completed",
            label: "Hook done",
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

    runUserInteractionBehaviorSystem(
      components,
      pressAt(0, 0),
      createManualClock(0),
    );

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")?.source).toBe(
      "agent-hook",
    );
  });
});
