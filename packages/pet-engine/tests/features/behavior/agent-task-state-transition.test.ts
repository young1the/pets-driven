import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentTaskEventSystem } from "@pets-driven/pet-engine/features/behavior/systems";
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
        { type: "SpeechState", speech: null, expiresAt: null },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "CompletionBehavior", intentAfterCompletion: "arrive" as const },
      ],
    },
  ]);
}

function agentEvent(type: AgentWorldEvent["type"]): AgentWorldEvent {
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
      message: null,
      updatedAt: 100,
      expiresAt: null,
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

  it("leaves AgentChannelState.message null when the event has no summary", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentTaskEventSystem(store, [agentEvent("task.started")], clock);
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBeNull();
  });
});
