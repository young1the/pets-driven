import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component } from "@pets-driven/pet-engine/core/components";
import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { runAutonomousBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/autonomous-speech-system";
import { runBehaviorDecisionSystem } from "@pets-driven/pet-engine/features/behavior/decision-system";
import {
  runQuietChatterSystem,
  runQuietStillnessSystem,
} from "@pets-driven/pet-engine/features/behavior/quiet-mode-systems";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * Quiet Mode's two promises: at `quiet` the pets stop chattering, at `still`
 * they also stop going places. Both are checked twice — once on the system that
 * carries them, and once on the world the desktop actually runs, because a
 * setting nothing reads is exactly the failure these tests exist to catch.
 */

const MONITOR = { id: "monitor", x: 0, y: 0, width: 1920, height: 1080 };
const STEP_MS = 16;

function storeWithChannel(source: "idle" | "social" | "interaction" | "agent-task") {
  return createComponentStore([
    {
      id: "pet",
      components: [
        {
          type: "AgentChannelState",
          source,
          status: source === "agent-task" ? "working" : null,
          label: null,
          message: "a line",
          updatedAt: 0,
          expiresAt: 3_000,
        },
      ],
    },
  ]);
}

describe("QuietChatterSystem", () => {
  it("drops every companion line once the pets are quiet", () => {
    for (const source of ["idle", "social", "interaction"] as const) {
      const store = storeWithChannel(source);
      runQuietChatterSystem(store, "quiet");

      expect(store.getComponent("pet", "AgentChannelState")).toBeUndefined();
    }
  });

  it("leaves the agent's own report alone — a silent pet still has a task", () => {
    const store = storeWithChannel("agent-task");
    runQuietChatterSystem(store, "still");

    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe("a line");
  });

  it("does nothing at all while the mode is off", () => {
    const store = storeWithChannel("idle");
    runQuietChatterSystem(store, "off");

    expect(store.getComponent("pet", "AgentChannelState")?.message).toBe("a line");
  });
});

describe("idle chatter under Quiet Mode", () => {
  function chattyStore() {
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

    return createComponentStore([{ id: "pet", components }]);
  }

  it("never opens its mouth, so nothing labels the pet as chatting", () => {
    const store = chattyStore();
    runAutonomousBehaviorSystem(store, createManualClock(10_000), createSeededRandom(3), "quiet");

    expect(store.getComponent("pet", "AgentChannelState")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("still speaks when the mode is off", () => {
    const store = chattyStore();
    runAutonomousBehaviorSystem(store, createManualClock(10_000), createSeededRandom(3), "off");

    expect(store.getComponent("pet", "AgentChannelState")?.message).toBeTruthy();
  });
});

describe("QuietStillnessSystem", () => {
  function walkingPet(extra: Component[] = []) {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "pursue" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 800, y: 200 } },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.2,
          },
          ...extra,
        ],
      },
    ]);
  }

  function velocityWriter() {
    const stopped: string[] = [];
    return {
      stopped,
      setVelocity(id: string) {
        stopped.push(id);
      },
    };
  }

  it("clears the errand a pet was already on", () => {
    const store = walkingPet();
    const physics = velocityWriter();
    runQuietStillnessSystem(store, physics, "still");

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(physics.stopped).toEqual(["pet"]);
  });

  it("holds nothing at the quiet level — a chattering pet may still wander", () => {
    const store = walkingPet();
    const physics = velocityWriter();
    runQuietStillnessSystem(store, physics, "quiet");

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({ x: 800, y: 200 });
    expect(physics.stopped).toEqual([]);
  });

  it("keeps its hands off a pet in the air, so a throw still lands", () => {
    const store = walkingPet([{ type: "AirborneTag" }]);
    const physics = velocityWriter();
    runQuietStillnessSystem(store, physics, "still");

    expect(physics.stopped).toEqual([]);
  });

  it("keeps its hands off the pet the user is holding", () => {
    const store = walkingPet();
    store.spawn("user-interaction", [
      {
        type: "DragInteraction",
        pointerId: 1,
        entityId: "pet",
        phase: "dragging",
        grabOffset: { x: 0, y: 0 },
        pointerPosition: { x: 200, y: 200 },
        startedAt: 0,
        samples: [],
      },
    ]);
    const physics = velocityWriter();
    runQuietStillnessSystem(store, physics, "still");

    expect(physics.stopped).toEqual([]);
  });
});

describe("decisions under Quiet Mode", () => {
  function idlePet() {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: true, climbing: false, mode: "stand" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.2,
          },
        ],
      },
    ]);
  }

  it("picks nothing new while the pets are stilled", () => {
    const store = idlePet();
    runBehaviorDecisionSystem(
      store,
      createManualClock(5_000),
      createSeededRandom(7),
      { width: 960, height: 540 },
      "still",
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
  });

  it("still decides at the quiet level", () => {
    const store = idlePet();
    runBehaviorDecisionSystem(
      store,
      createManualClock(5_000),
      createSeededRandom(7),
      { width: 960, height: 540 },
      "quiet",
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeDefined();
  });
});

describe("Quiet Mode on the live desktop world", () => {
  function settledDesktopWorld() {
    const scenario = createAdoptedPetsScenario(
      [{ id: "pet-a", sourceId: "agent-a", name: "Alice" }],
      { monitors: [MONITOR] },
    );

    for (let i = 0; i < 120; i += 1) {
      scenario.clock.advanceBy(STEP_MS);
      scenario.world.step(STEP_MS);
    }

    return scenario;
  }

  /** Send the pet off across the screen and let the world run. */
  function walkAcross(scenario: ReturnType<typeof settledDesktopWorld>, ticks: number) {
    const start = scenario.world.getComponent("pet-a", "Transform")?.position.x ?? 0;

    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: start + 600, y: MONITOR.height - 200 },
    });
    scenario.world.setComponent("pet-a", { type: "Steering", mode: "pursue" });

    for (let i = 0; i < ticks; i += 1) {
      scenario.clock.advanceBy(STEP_MS);
      scenario.world.step(STEP_MS);
    }

    return Math.abs((scenario.world.getComponent("pet-a", "Transform")?.position.x ?? 0) - start);
  }

  it("lets a pet cross the screen with the mode off", () => {
    expect(walkAcross(settledDesktopWorld(), 120)).toBeGreaterThan(10);
  });

  it("parks a pet mid-errand once the world is stilled", () => {
    const scenario = settledDesktopWorld();
    scenario.world.setQuietMode("still");

    expect(walkAcross(scenario, 120)).toBeLessThan(1);
  });

  it("keeps every line off the screen while the world is quiet", () => {
    const scenario = settledDesktopWorld();
    scenario.world.setQuietMode("quiet");

    // Well past the idle threshold, which is the one line a pet alone on a
    // desktop reliably produces.
    for (let i = 0; i < 1_200; i += 1) {
      scenario.clock.advanceBy(STEP_MS);
      scenario.world.step(STEP_MS);
      expect(scenario.world.getComponent("pet-a", "AgentChannelState")).toBeUndefined();
    }
  });
});
