import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentTaskEventSystem } from "@pets-driven/pet-engine/features/behavior/agent-task-systems";
import { runBehaviorPlanningSystem } from "@pets-driven/pet-engine/features/behavior/planning-system";
import { runBehaviorDecisionSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };

function makeStore(status?: "working" | "waiting" | "completed" | "failed") {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentBinding", sourceId: "agent-a" },
        { type: "Steering", mode: "stand" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "Transform", position: { x: 500, y: 500 } },
        { type: "PhysicsBody", width: 32, height: 48, shape: "rectangle" as const },
        {
          type: "Personality",
          catalogId: "steady",
          openness: 0.5,
          conscientiousness: 0.8,
          extraversion: 0.3,
          agreeableness: 0.5,
          neuroticism: 0.2,
        },
        {
          type: "SpeechProfile",
          idleCompanion: "hi",
          attentionNeeded: "look",
          taskStarted: "working",
          taskCompleted: "done",
        },
        { type: "ActivityState", lastActiveAt: 0 },
        ...(status ? [{ type: "AgentTaskState" as const, status, since: 0 }] : []),
      ],
    },
  ]);
}

function toolPulse(at: number, activity?: "study" | "edit" | "run"): AgentWorldEvent {
  return { kind: "agent", type: "tool.used", sourceId: "agent-a", at, activity };
}

function taskEvent(
  type: Exclude<AgentWorldEvent["type"], "tool.used" | "attention.requested">,
  at: number,
): AgentWorldEvent {
  return { kind: "agent", type, sourceId: "agent-a", at };
}

describe("agent tool pulse", () => {
  it("starts idle work silently and records provider-neutral activity", () => {
    const store = makeStore();

    runAgentTaskEventSystem(store, [toolPulse(100, "study")], createManualClock(100));

    expect(store.getComponent("pet", "AgentTaskState")).toEqual({
      type: "AgentTaskState",
      status: "working",
      since: 100,
      summary: undefined,
    });
    expect(store.getComponent("pet", "AgentActivitySignal")).toEqual({
      type: "AgentActivitySignal",
      activity: "study",
      at: 100,
    });
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBeNull();
  });

  it("never reopens completed or failed work from a delayed pulse", () => {
    for (const terminal of ["completed", "failed"] as const) {
      const store = makeStore(terminal);
      store.setComponent("pet", { type: "TaskMovementHold", since: 0 });

      runAgentTaskEventSystem(store, [toolPulse(9_000, "edit")], createManualClock(9_000));

      expect(store.getComponent("pet", "AgentTaskState")?.status).toBe(terminal);
      expect(store.getComponent("pet", "TaskMovementHold")).toBeDefined();
      expect(store.getComponent("pet", "AgentActivitySignal")).toBeUndefined();
    }
  });

  it("resumes waiting work without speaking a tool name", () => {
    const store = makeStore("waiting");
    store.setComponent("pet", { type: "TaskMovementHold", since: 0 });

    runAgentTaskEventSystem(store, [toolPulse(9_000, "run")], createManualClock(9_000));

    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "TaskMovementHold")).toBeUndefined();
    expect(store.getComponent("pet", "AgentChannelState")?.message).toBeNull();
  });

  it("does not restart a selected behavior under a burst of hook pulses", () => {
    const store = makeStore();
    runAgentTaskEventSystem(store, [taskEvent("task.started", 0)], createManualClock(0));
    runBehaviorDecisionSystem(store, createManualClock(0), { next: () => 0.5 }, BOUNDS);
    runBehaviorPlanningSystem(store, createManualClock(0));

    const initial = store.getComponent("pet", "BehaviorDecisionState");
    expect(initial?.reason).toMatch(/^work-/);
    expect(initial!.expiresAt - initial!.decidedAt).toBeGreaterThanOrEqual(1_200);

    const pulses = Array.from({ length: 100 }, (_, index) =>
      toolPulse(100 + index, (["study", "edit", "run"] as const)[index % 3]),
    );
    runAgentTaskEventSystem(store, pulses, createManualClock(200));
    runBehaviorDecisionSystem(store, createManualClock(200), { next: () => 0.9 }, BOUNDS);

    const afterBurst = store.getComponent("pet", "BehaviorDecisionState");
    expect(afterBurst?.reason).toBe(initial?.reason);
    expect(afterBurst?.decidedAt).toBe(initial?.decidedAt);
    expect(store.getComponent("pet", "AgentChannelState")?.message).not.toMatch(
      /read|edit|bash|tool/i,
    );
  });
});
