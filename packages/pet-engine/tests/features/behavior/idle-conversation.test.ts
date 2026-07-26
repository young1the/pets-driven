import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component } from "@pets-driven/pet-engine/core/components";
import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";
import { runAutonomousBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/** A pet whose idle-chatter threshold (2s) lapsed long ago. */
function makeChattyStore(agentTask?: { status: AgentTaskStatus; workingPose?: boolean }) {
  const components: Component[] = [
    { type: "IdleConversation", idleAfterMs: 2_000 },
    {
      type: "SpeechProfile",
      idleCompanion: "petSpeech.playful.idle",
      attentionNeeded: "attention",
      taskStarted: "started",
      taskCompleted: "completed",
    },
    { type: "ActivityState", lastActiveAt: 0 },
  ];

  if (agentTask) {
    components.push({ type: "AgentTaskState", status: agentTask.status, since: 0 });
  }
  if (agentTask?.workingPose) {
    components.push({
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 9_000,
      expiresAt: 11_000,
      reason: "working-ponder",
      lastAutonomousReason: "working-ponder",
      lastAutonomousAt: 9_000,
    });
  }

  return createComponentStore([{ id: "pet", components }]);
}

function run(store: ReturnType<typeof makeChattyStore>) {
  runAutonomousBehaviorSystem(store, createManualClock(10_000), createSeededRandom(3));
}

describe("idle companion chatter", () => {
  it("speaks for a pet with no agent task once the idle threshold lapses", () => {
    const store = makeChattyStore();
    run(store);

    expect(store.getComponent("pet", "AgentChannelState")?.message).toMatch(
      /^petSpeech\.playful\.idle\.\d$/,
    );
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("idle conversation");
  });

  it("speaks for a pet whose task already went back to idle", () => {
    const store = makeChattyStore({ status: "idle" });
    run(store);

    expect(store.getComponent("pet", "AgentChannelState")?.message).toBeTruthy();
  });

  /**
   * Ambient chatter used to claim over the working pose for the bubble's whole
   * life, which turned the capsule ambient and labelled a busy pet "Chatting" —
   * it read as if the task had been released.
   */
  it("stays quiet while the agent is working, leaving the working pose in place", () => {
    const store = makeChattyStore({ status: "working", workingPose: true });
    run(store);

    expect(store.getComponent("pet", "AgentChannelState")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-ponder");
  });

  it.each([
    "waiting",
    "failed",
    "completed",
  ] as const)("stays quiet while a %s report is still held", (status) => {
    const store = makeChattyStore({ status });
    run(store);

    expect(store.getComponent("pet", "AgentChannelState")).toBeUndefined();
  });
});
