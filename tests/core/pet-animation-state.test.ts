import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@/core/scenario-fixtures";

function petBodyAnimationState(id: string) {
  const scenario = createDemoScenario();
  const bodySnapshot = () =>
    scenario.world.snapshot().bodies.find((body) => body.id === id);

  return {
    scenario,
    bodySnapshot,
    animationState: () => bodySnapshot()?.animationState,
  };
}

describe("pet animation state", () => {
  it("uses idle when a pet has no active animation cue", () => {
    const { animationState } = petBodyAnimationState("pet-a");

    expect(animationState()).toBe("idle");
  });

  it("uses directional running states for motion targets", () => {
    const { scenario, bodySnapshot } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 820, y: 500 },
    });
    expect(bodySnapshot()).toMatchObject({
      animationState: "running-right",
      spriteFacing: "right",
    });

    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 120, y: 500 },
    });
    expect(bodySnapshot()).toMatchObject({
      animationState: "running-left",
      spriteFacing: "left",
    });
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

  it("uses failed for failed agent events", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.failed",
      sourceId: "agent-a",
      at: 1,
      summary: "Tool failed",
    });
    scenario.world.step(0);

    expect(animationState()).toBe("failed");
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

  it("keeps left-facing direction while jumping toward a left motion target", () => {
    const { scenario, bodySnapshot } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 120, y: 500 },
    });
    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });

    expect(bodySnapshot()).toMatchObject({
      animationState: "jumping",
      spriteFacing: "left",
    });
  });
});
