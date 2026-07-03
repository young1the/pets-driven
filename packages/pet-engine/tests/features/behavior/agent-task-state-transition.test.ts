import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentEventBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";

function makeStore() {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentBinding", sourceId: "agent-a" },
        { type: "IntentState", intent: "idle" as const },
        {
          type: "SpeechProfile",
          idleCompanion: "hi",
          attentionNeeded: "look",
          taskStarted: "working",
          taskCompleted: "done",
        },
        { type: "SpeechState", speech: null, expiresAt: null },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "CompletionBehavior", intentAfterCompletion: "seek" as const },
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

describe("runAgentEventBehaviorSystem → AgentTaskState", () => {
  it("task.started sets status working and intent active", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentEventBehaviorSystem(store, [agentEvent("task.started")], clock);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("task.started publishes working status to the agent channel", () => {
    const store = makeStore();
    const clock = createManualClock(100);

    runAgentEventBehaviorSystem(store, [agentEvent("task.started")], clock);

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

  it("task.completed sets status completed and intent from CompletionBehavior", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentEventBehaviorSystem(store, [agentEvent("task.completed")], clock);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe(
      "completed",
    );
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("seek");
    expect(store.getComponent("pet", "AgentChannelState")?.label).toBe("Done");
  });

  it("task.waiting sets status waiting; task.failed sets status failed", () => {
    const waitStore = makeStore();
    runAgentEventBehaviorSystem(
      waitStore,
      [agentEvent("task.waiting")],
      createManualClock(100),
    );
    expect(waitStore.getComponent("pet", "AgentTaskState")?.status).toBe(
      "waiting",
    );

    const failStore = makeStore();
    runAgentEventBehaviorSystem(
      failStore,
      [agentEvent("task.failed")],
      createManualClock(100),
    );
    expect(failStore.getComponent("pet", "AgentTaskState")?.status).toBe(
      "failed",
    );
  });

  it("passes event.summary through to AgentChannelState.message", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentEventBehaviorSystem(
      store,
      [{ ...agentEvent("task.completed"), summary: "Fixed the flaky test" }],
      clock,
    );
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe(
      "Fixed the flaky test",
    );
  });

  it("leaves AgentChannelState.message null when the event has no summary", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentEventBehaviorSystem(store, [agentEvent("task.started")], clock);
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBeNull();
  });
});
