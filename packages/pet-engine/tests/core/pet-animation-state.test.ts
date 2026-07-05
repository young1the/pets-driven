import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";

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

  it("uses directional running states while moving horizontally", () => {
    const { scenario, bodySnapshot } = petBodyAnimationState("pet-a");

    scenario.world.setPhysicsVelocity("pet-a", { x: 4, y: 0 });
    expect(bodySnapshot()).toMatchObject({
      animationState: "running-right",    });

    scenario.world.setPhysicsVelocity("pet-a", { x: -4, y: 0 });
    expect(bodySnapshot()).toMatchObject({
      animationState: "running-left",    });
  });

  it("does not infer left or right when the pet is not moving", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });
    scenario.world.setPhysicsVelocity("pet-a", { x: 0, y: 0 });
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

  it("uses review for completed agent events", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 1,
      summary: "Done",
    });
    scenario.world.step(0);

    expect(animationState()).toBe("review");
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

  it("keeps left-facing direction while jumping with leftward momentum", () => {
    const { scenario, bodySnapshot } = petBodyAnimationState("pet-a");

    scenario.world.setPhysicsVelocity("pet-a", { x: -4, y: 0 });
    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });

    expect(bodySnapshot()).toMatchObject({
      animationState: "jumping",    });
  });

  it("shows travel animation when a working pet is moving", () => {
    const { scenario, bodySnapshot } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "AgentTaskState",
      status: "working",
      since: 0,
    });
    scenario.world.setPhysicsVelocity("pet-a", { x: 4, y: 0 });
    expect(bodySnapshot()).toMatchObject({
      animationState: "running-right",    });

    scenario.world.setPhysicsVelocity("pet-a", { x: -4, y: 0 });
    expect(bodySnapshot()).toMatchObject({
      animationState: "running-left",    });
  });

  it("shows running animation when a working pet is not moving", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "AgentTaskState",
      status: "working",
      since: 0,
    });
    scenario.world.setPhysicsVelocity("pet-a", { x: 0, y: 0 });
    expect(animationState()).toBe("running");
  });
});
