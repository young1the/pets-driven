import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { describe, expect, it } from "vitest";

describe("snapshot surfaces agentTask", () => {
  it("a working pet has agentTask.status working and null badge label", () => {
    const { world } = createDemoScenario();
    world.pushEvent({
      kind: "agent",
      type: "task.started",
      sourceId: "agent-a",
      at: 0,
    });
    world.step(16);
    const pet = world.snapshot().pets.find((p) => p.sourceId === "agent-a");
    expect(pet?.agentTask?.status).toBe("working");
    expect(pet?.agentTask?.label).toBeNull();
    // With no event summary the working line falls back to the SpeechProfile
    // default, and its non-freezing status rides the shared TTL.
    expect(pet?.agentChannel).toEqual({
      source: "agent-task",
      status: "working",
      label: "Working",
      message: "Working on it.",
      updatedAt: 0,
      expiresAt: 3_000,
    });
  });

  it("a completed pet has DONE badge label", () => {
    const { world } = createDemoScenario();
    world.pushEvent({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 0,
    });
    world.step(16);
    const pet = world.snapshot().pets.find((p) => p.sourceId === "agent-a");
    expect(pet?.agentTask?.status).toBe("completed");
    expect(pet?.agentTask?.label).toBe("DONE");
    expect(pet?.agentChannel?.label).toBe("Done");
  });
});
