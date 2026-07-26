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
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "CompletionBehavior", intentAfterCompletion: "arrive" as const },
      ],
    },
  ]);
}

function toolPulse(at: number, tool?: string): AgentWorldEvent {
  return { kind: "agent", type: "tool.used", sourceId: "agent-a", at, tool };
}

function taskEvent(type: AgentWorldEvent["type"], at: number): AgentWorldEvent {
  return { kind: "agent", type, sourceId: "agent-a", at };
}

describe("agent tool pulse", () => {
  it("starts the work when a tool fires on an idle pet", () => {
    const store = makeStore();

    runAgentTaskEventSystem(store, [toolPulse(100, "Read")], createManualClock(100));

    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "AgentToolActivity")).toEqual({
      type: "AgentToolActivity",
      family: "study",
      at: 100,
    });
  });

  /**
   * The bug this whole path exists for: tools fire several times a second, and
   * each one used to re-run the task-start beat — a fresh 5s agent-event claim
   * that outlived the gap to the next tool, so the pet spent entire sessions
   * pinned under it and never played a working pose.
   */
  it("does not re-claim or re-speak while the pet is already working", () => {
    const store = makeStore();
    runAgentTaskEventSystem(store, [taskEvent("task.started", 100)], createManualClock(100));

    const workingPose = {
      type: "BehaviorDecisionState" as const,
      source: "autonomous" as const,
      decidedAt: 6_000,
      expiresAt: 8_000,
      reason: "working-tinker",
      lastAutonomousReason: "working-tinker",
      lastAutonomousAt: 6_000,
    };
    store.setComponent("pet", workingPose);
    store.removeComponent("pet", "AgentChannelState");

    runAgentTaskEventSystem(store, [toolPulse(6_100, "Edit")], createManualClock(6_100));

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-tinker");
    expect(store.getComponent("pet", "AgentChannelState")).toBeUndefined();
    expect(store.getComponent("pet", "AgentToolActivity")?.family).toBe("edit");
  });

  it("keeps the original start time so a long task does not look restarted", () => {
    const store = makeStore();
    runAgentTaskEventSystem(store, [taskEvent("task.started", 100)], createManualClock(100));
    runAgentTaskEventSystem(store, [toolPulse(9_000, "Bash")], createManualClock(9_000));

    expect(store.getComponent("pet", "AgentTaskState")?.since).toBe(100);
  });

  it("records the pulse with no family when the agent names no tool (Codex)", () => {
    const store = makeStore();

    runAgentTaskEventSystem(store, [toolPulse(100)], createManualClock(100));

    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "AgentToolActivity")).toEqual({
      type: "AgentToolActivity",
      family: null,
      at: 100,
    });
  });

  /** Tool activity after a settled report means the agent picked work back up. */
  it.each([
    "task.waiting",
    "task.completed",
    "task.failed",
  ] as const)("resumes working from a %s report", (type) => {
    const store = makeStore();
    runAgentTaskEventSystem(store, [taskEvent(type, 100)], createManualClock(100));
    expect(store.getComponent("pet", "TaskMovementHold")).toBeDefined();

    runAgentTaskEventSystem(store, [toolPulse(9_000, "Read")], createManualClock(9_000));

    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "TaskMovementHold")).toBeUndefined();
  });
});
