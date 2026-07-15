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
    // With no event summary the working line falls back to the pet's personality
    // SpeechProfile: a localized petSpeech.* key (resolved to a random variant),
    // and its non-freezing status rides the shared TTL. pet-a is the "playful"
    // catalog personality.
    expect(pet?.agentChannel).toMatchObject({
      source: "agent-task",
      status: "working",
      label: "Working",
      updatedAt: 0,
      expiresAt: 3_000,
    });
    expect(pet?.agentChannel?.message).toMatch(/^petSpeech\.playful\.started\.\d$/);
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
