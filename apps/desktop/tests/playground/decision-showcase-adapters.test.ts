import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { describe, expect, it } from "vitest";
import {
  applyCollisionDecisionStimulus,
  createAgentDecisionStimulus,
  explainDecisionPipeline,
} from "@/playground/browser/decision-showcase-adapter";

describe("decision showcase adapter", () => {
  it("creates an agent world event for the selected pet binding", () => {
    const scenario = createDemoScenario();

    const result = createAgentDecisionStimulus({
      getComponent: scenario.world.getComponent,
      now: 123,
      petId: "pet-a",
      summary: "Build failed",
      type: "task.failed",
    });

    expect(result).toEqual({
      ok: true,
      event: {
        kind: "agent",
        type: "task.failed",
        sourceId: "agent-a",
        at: 123,
        summary: "Build failed",
      },
      stimulus: {
        channel: "agent",
        label: "task.failed",
        detail: "Build failed",
      },
    });
  });

  it("injects a collider into the collision reaction path", () => {
    const scenario = createDemoScenario();

    const result = applyCollisionDecisionStimulus({
      colliderPetId: "pet-b",
      now: 80,
      petId: "pet-a",
      world: scenario.world,
    });

    expect(result.ok).toBe(true);

    expect(scenario.world.getComponent("pet-a", "PendingReaction")).toMatchObject({
      source: "collision",
      triggeredAt: 80,
      reactsAt: 80,
      context: {
        otherEntityId: "pet-b",
      },
    });
    expect(scenario.world.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("collision");
  });

  it("explains agent-event claims, planning state, and presentation state", () => {
    const scenario = createDemoScenario();
    const stimulus = createAgentDecisionStimulus({
      getComponent: scenario.world.getComponent,
      now: scenario.clock.now(),
      petId: "pet-a",
      summary: "Build failed",
      type: "task.failed",
    });
    expect(stimulus.ok).toBe(true);
    if (!stimulus.ok) return;

    scenario.world.pushEvent(stimulus.event);
    scenario.clock.advanceBy(16);
    scenario.world.step(16);

    const pet = scenario.world.snapshot().pets.find((entry) => entry.id === "pet-a");
    expect(pet).toBeDefined();
    if (!pet) return;

    const explanation = explainDecisionPipeline({
      getComponent: scenario.world.getComponent,
      lastStimulus: stimulus.stimulus,
      now: scenario.clock.now(),
      pet,
    });

    expect(explanation.steps.map((step) => step.id)).toEqual([
      "stimulus",
      "priority",
      "decision",
      "planning",
      "presentation",
    ]);
    expect(explanation.steps.find((step) => step.id === "priority")).toMatchObject({
      status: "complete",
      value: "agent-event",
      detail: "task.failed",
    });
    expect(explanation.steps.find((step) => step.id === "planning")).toMatchObject({
      status: "complete",
      value: "stand",
    });
    expect(explanation.steps.find((step) => step.id === "presentation")).toMatchObject({
      status: "complete",
      value: "failed",
    });
  });
});
