import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runWorkingBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };

function makeStore(opts: {
  status: "working" | "idle";
  conscientiousness: number;
  extraversion: number;
  motionTarget?: { x: number; y: number } | null;
  existingClaim?: { source: "agent-event" | "autonomous"; expiresAt: number };
}) {
  const components: import("@pets-driven/pet-engine/core/components").Component[] =
    [
      { type: "AgentTaskState", status: opts.status, since: 0 },
      {
        type: "Personality",
        openness: 0.5,
        conscientiousness: opts.conscientiousness,
        extraversion: opts.extraversion,
        agreeableness: 0.5,
        neuroticism: 0.3,
      },
      { type: "IntentState", intent: "active" as const },
      {
        type: "MotionTarget",
        targetEntityId: null,
        targetPosition: opts.motionTarget ?? null,
      },
      { type: "Transform", position: { x: 500, y: 500 } },
      {
        type: "PhysicsBody",
        width: 32,
        height: 48,
        shape: "rectangle" as const,
      },
    ];

  if (opts.existingClaim) {
    components.push({
      type: "BehaviorDecisionState",
      source: opts.existingClaim.source,
      decidedAt: 0,
      expiresAt: opts.existingClaim.expiresAt,
      reason: "test-claim",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });
  }

  return createComponentStore([{ id: "pet", components }]);
}

describe("runWorkingBehaviorSystem", () => {
  it("does nothing when status is not working", () => {
    const store = makeStore({
      status: "idle",
      conscientiousness: 0.2,
      extraversion: 0.8,
    });
    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("does nothing when motion target is already set", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
      motionTarget: { x: 700, y: 500 },
    });
    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 700,
      y: 500,
    });
  });

  it("does nothing when an active claim holds (agent-event)", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
      existingClaim: { source: "agent-event", expiresAt: 5000 },
    });
    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
      "test-claim",
    );
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).toBeNull();
  });

  it("focused pet (high C) claims working-focus without a motion target", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.85,
      extraversion: 0.45,
    });
    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).toBeNull();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
      "working-focus",
    );
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("can reselect working behavior after a working collision expression is written", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.85,
      extraversion: 0.45,
      existingClaim: { source: "autonomous", expiresAt: 100 },
    });
    store.setComponent("pet", {
      type: "PetExpressionState",
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 100,
      expiresAt: 700,
    });

    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
      "working-focus",
    );
    expect(store.getComponent("pet", "PetExpressionState")?.label).toBe("!");
  });

  it("distracted pet (low C, high E) picks a wander-near target", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
    });
    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).not.toBeNull();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
      "working-wander",
    );
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("respects an expired claim (fires again after cooldown)", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
      existingClaim: { source: "autonomous", expiresAt: 50 },
    });
    runWorkingBehaviorSystem(
      store,
      createManualClock(100),
      createSeededRandom(42),
      BOUNDS,
    );
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).not.toBeNull();
  });
});
