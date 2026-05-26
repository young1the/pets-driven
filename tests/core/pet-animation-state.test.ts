import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@/core/scenario-fixtures";

function petBodyAnimationState(id: string) {
  const scenario = createDemoScenario();
  return {
    scenario,
    animationState() {
      return scenario.world.snapshot().bodies.find((body) => body.id === id)
        ?.animationState;
    },
  };
}

describe("pet animation state", () => {
  it("uses idle when a pet has no active animation cue", () => {
    const { animationState } = petBodyAnimationState("pet-a");

    expect(animationState()).toBe("idle");
  });

  it("uses directional running rows from motion targets", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 820, y: 500 },
    });
    expect(animationState()).toBe("running-right");

    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 120, y: 500 },
    });
    expect(animationState()).toBe("running-left");
  });

  it("does not infer left or right when no target exists", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });
    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    scenario.world.setComponent("pet-a", {
      type: "IntentState",
      intent: "active",
    });

    expect(animationState()).toBe("running");
  });

  it("uses waiting for blocked-on-user-input agent events", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });
    scenario.world.step(0);

    expect(animationState()).toBe("waiting");
  });

  it("uses task-running and jumping rows for matching behavior state", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });
    scenario.world.setComponent("pet-a", {
      type: "IntentState",
      intent: "active",
    });
    expect(animationState()).toBe("running");

    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
    expect(animationState()).toBe("jumping");
  });
});
