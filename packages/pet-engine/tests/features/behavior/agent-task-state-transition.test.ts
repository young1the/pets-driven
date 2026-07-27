import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentTaskEventSystem } from "@pets-driven/pet-engine/features/behavior/agent-task-systems";
import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
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
          type: "SpeechProfile",
          idleCompanion: "hi",
          attentionNeeded: "look",
          taskStarted: "working",
          taskCompleted: "done",
        },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "CompletionBehavior", intentAfterCompletion: "arrive" as const },
      ],
    },
  ]);
}

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
    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "TaskMovementHold")).toBeUndefined();
  });

  it("task.started publishes working status to the agent channel", () => {
    const store = makeStore();
    const clock = createManualClock(100);

    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock);

    expect(store.getComponent("pet", "AgentChannelState")).toEqual({
      type: "AgentChannelState",
      source: "agent-task",
      status: "working",
      label: "Working",
      // With no event summary the line falls back to the SpeechProfile default.
      message: "working",
      updatedAt: 100,
      // "working" is non-freezing, so its line rides the shared TTL.
      expiresAt: 3_100,
    });
  });

  it("task.completed sets status completed and holds movement", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(store, [agentEvent("task.completed")], clock);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("completed");
    expect(store.getComponent("pet", "TaskMovementHold")).toBeDefined();
    expect(store.getComponent("pet", "AgentChannelState")?.label).toBe("Done");
  });

  it("task.waiting and task.failed set status and hold movement", () => {
    const waitStore = makeStore();
    runAgentTaskEventSystem(waitStore, [agentEvent("task.waiting")], createManualClock(100));
    expect(waitStore.getComponent("pet", "AgentTaskState")?.status).toBe("waiting");
    expect(waitStore.getComponent("pet", "TaskMovementHold")).toBeDefined();

    const failStore = makeStore();
    runAgentTaskEventSystem(failStore, [agentEvent("task.failed")], createManualClock(100));
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
    );

    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("completed");
    expect(store.getComponent("pet", "TaskMovementHold")).toEqual({
      type: "TaskMovementHold",
      since: 200,
    });
  });

  it("passes event.summary through to AgentChannelState.message", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(
      store,
      [{ ...agentEvent("task.completed"), summary: "Fixed the flaky test" }],
      clock,
    );
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe("Fixed the flaky test");
  });

  it("falls back to the SpeechProfile line when the event has no summary", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock);
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe("working");
  });
});
