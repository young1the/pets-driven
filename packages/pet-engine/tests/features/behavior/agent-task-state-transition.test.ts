import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentTaskEventSystem } from "@pets-driven/pet-engine/features/behavior/agent-task-systems";
import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

function makeStore() {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentBinding", sourceId: "agent-a" },
        { type: "Steering", mode: "stand" as const },
        {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 300, y: 200 },
        },
        {
          type: "ContactState",
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        {
          type: "SpeechProfile",
          idleCompanion: "hi",
          attentionNeeded: "look",
          taskStarted: "working",
          taskCompleted: "done",
          taskFailed: "failed",
        },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "CompletionBehavior", intentAfterCompletion: "arrive" as const },
      ],
    },
  ]);
}

const noOpPhysics = { setVelocity: () => {} };

type LifecycleAgentEvent = Exclude<AgentWorldEvent, { type: "tool.used" | "attention.requested" }>;

function agentEvent(type: LifecycleAgentEvent["type"]): LifecycleAgentEvent {
  return {
    kind: "agent",
    type,
    sourceId: "agent-a",
    at: 100,
    summary: undefined,
  };
}

describe("runAgentTaskEventSystem → AgentTaskState", () => {
  it("task.started sets status working and does not hold movement", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock, noOpPhysics);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "TaskMovementHold")).toBeUndefined();
  });

  it("task.started publishes working status to the agent channel", () => {
    const store = makeStore();
    const clock = createManualClock(100);

    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock, noOpPhysics);

    expect(store.getComponent("pet", "AgentChannelState")).toEqual({
      type: "AgentChannelState",
      source: "agent-task",
      status: "working",
      label: "Working",
      // Provider details never replace the pet's personality line.
      message: "working",
      updatedAt: 100,
      // "working" is non-freezing, so its line rides the shared TTL.
      expiresAt: 3_100,
    });
  });

  it("task.completed sets status completed and holds movement", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(store, [agentEvent("task.completed")], clock, noOpPhysics);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("completed");
    expect(store.getComponent("pet", "TaskMovementHold")).toBeDefined();
    expect(store.getComponent("pet", "AgentChannelState")?.label).toBe("Done");
  });

  it("settles a grounded pet once when the movement hold is applied", () => {
    const store = makeStore();
    const velocities: Array<{ x?: number; y?: number }> = [];

    runAgentTaskEventSystem(
      store,
      [agentEvent("task.completed")],
      createManualClock(100),
      { setVelocity: (_id, velocity) => velocities.push(velocity) },
      createSeededRandom(1),
    );

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(velocities).toEqual([{ x: 0 }]);
  });

  it("does not erase airborne velocity when the movement hold is applied", () => {
    const store = makeStore();
    store.setComponent("pet", {
      type: "ContactState",
      grounded: false,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });
    const velocities: Array<{ x?: number; y?: number }> = [];

    runAgentTaskEventSystem(
      store,
      [agentEvent("task.completed")],
      createManualClock(100),
      { setVelocity: (_id, velocity) => velocities.push(velocity) },
      createSeededRandom(1),
    );

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(velocities).toEqual([]);
  });

  it("task.waiting and task.failed set status and hold movement", () => {
    const waitStore = makeStore();
    runAgentTaskEventSystem(
      waitStore,
      [agentEvent("task.waiting")],
      createManualClock(100),
      noOpPhysics,
    );
    expect(waitStore.getComponent("pet", "AgentTaskState")?.status).toBe("waiting");
    expect(waitStore.getComponent("pet", "TaskMovementHold")).toBeDefined();

    const failStore = makeStore();
    runAgentTaskEventSystem(
      failStore,
      [agentEvent("task.failed")],
      createManualClock(100),
      noOpPhysics,
    );
    expect(failStore.getComponent("pet", "AgentTaskState")?.status).toBe("failed");
    expect(failStore.getComponent("pet", "TaskMovementHold")).toBeDefined();
  });

  it("ingests lifecycle facts even while a user behavior claim is active", () => {
    const store = makeStore();
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "user-interaction",
      decidedAt: 0,
      expiresAt: 5_000,
      reason: "petting",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runAgentTaskEventSystem(
      store,
      [agentEvent("task.started"), { ...agentEvent("task.completed"), at: 200 }],
      createManualClock(200),
      noOpPhysics,
    );

    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("completed");
    expect(store.getComponent("pet", "TaskMovementHold")).toEqual({
      type: "TaskMovementHold",
      since: 200,
    });
  });

  it("keeps event.summary as task detail while the personality owns the channel line", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(
      store,
      [{ ...agentEvent("task.completed"), summary: "Fixed the flaky test" }],
      clock,
      noOpPhysics,
    );
    expect(store.getComponent("pet", "AgentTaskState")?.summary).toBe("Fixed the flaky test");
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe("done");
  });

  it("uses the SpeechProfile line when the event has no summary", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock, noOpPhysics);
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe("working");
  });
});

describe("an unbound pet is unreachable by agent events", () => {
  // The pet a user hatched but never bound to a folder has no AgentBinding at
  // all (see `createFixturePet`), so the system's query skips it. Before this,
  // such a pet was given its own id as a stand-in sourceId purely so it would
  // survive the snapshot query — which made it a live address, and a stray
  // event could push it into a "Working" capsule with no session behind it.
  function makeUnboundStore() {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" as const },
          {
            type: "SpeechProfile",
            idleCompanion: "hi",
            attentionNeeded: "look",
            taskStarted: "working",
            taskCompleted: "done",
            taskFailed: "failed",
          },
          { type: "ActivityState", lastActiveAt: 0 },
          { type: "CompletionBehavior", intentAfterCompletion: "arrive" as const },
        ],
      },
    ]);
  }

  it("task.started leaves an unbound pet with no task state or channel", () => {
    const store = makeUnboundStore();
    const clock = createManualClock(100);

    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock, noOpPhysics);

    expect(store.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(store.getComponent("pet", "AgentChannelState")).toBeUndefined();
  });

  it("ignores an event whose sourceId equals the unbound pet's own entity id", () => {
    const store = makeUnboundStore();
    const clock = createManualClock(100);

    runAgentTaskEventSystem(
      store,
      [{ ...agentEvent("task.started"), sourceId: "pet" }],
      clock,
      noOpPhysics,
    );

    expect(store.getComponent("pet", "AgentTaskState")).toBeUndefined();
  });
});
