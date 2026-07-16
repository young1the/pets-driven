import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPettingDetectionSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * 5 samples oscillating x over the pet at (0, 0): -10 -> 10 -> -10 -> 10 -> -10.
 * dx signs: +,-,+,- → 3 direction reversals; displacement = 20px. Satisfies
 * PETTING_MIN_REVERSALS(3) and stays under PETTING_MAX_DISPLACEMENT_PX(60).
 */
const STROKE_SAMPLES = [
  { at: 0, position: { x: -10, y: 0 } },
  { at: 100, position: { x: 10, y: 0 } },
  { at: 200, position: { x: -10, y: 0 } },
  { at: 300, position: { x: 10, y: 0 } },
  { at: 400, position: { x: -10, y: 0 } },
];

type PetComponents = Parameters<typeof createComponentStore>[0][number]["components"];

function storeWithStrokedPet(petComponents: PetComponents) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: -10, y: 0 } },
        { type: "CursorState", position: { x: -10, y: 0 }, samples: STROKE_SAMPLES },
      ],
    },
    { id: "user-interaction", components: [] },
    { id: "pet", components: petComponents },
  ]);
}

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

describe("petting releases the agent task state", () => {
  it("clears the hold, task state, and channel badge when a settled pet is petted", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
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
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "TaskMovementHold")).toBeUndefined();
    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
  });

  it("clears a live working status too — petting dismisses the report entirely", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
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
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
    // "working" has no acknowledge beat: the plain petting love reaction stays.
    expect(components.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "petting",
      mood: "love",
      emote: "heart",
    });
  });

  it("leaves a non-agent-task channel badge in place when clearing", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
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
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")?.source).toBe("agent-hook");
  });

  it("does NOT release the task when the pet is merely pressed", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "PetIdentity", name: "Pet" },
          { type: "CanControl", speed: 1.4 },
          { type: "CanDrag" },
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

    runUserInteractionBehaviorSystem(components, pressAt(0, 0), createManualClock(0));

    expect(components.getComponent("pet", "TaskMovementHold")).toBeDefined();
    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe("waiting");
    expect(components.getComponent("pet", "AgentChannelState")?.label).toBe("Waiting");
  });
});
