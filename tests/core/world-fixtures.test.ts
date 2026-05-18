import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@/core/world/scenario-fixtures";

describe("demo scenario", () => {
  it("creates multiple pets in one shared world", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.bodies).toHaveLength(3);
  });

  it("creates a configurable user anchor entity", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 480, y: 500 },
    });

    expect(scenario.world.getEntity("user-anchor")).toEqual({
      id: "user-anchor",
      kind: "user-anchor",
      position: { x: 480, y: 500 },
    });
  });

  it("gives fixture pets movement profiles and motion state", () => {
    const scenario = createDemoScenario();
    const pet = scenario.world.getPet("pet-a");

    expect(pet?.movement).toEqual({
      idleSpeed: 0.0006,
      activeSpeed: 0.0012,
      seekUserSpeed: 0.0018,
    });
    expect(pet?.runtime.motion).toEqual({
      targetEntityId: null,
      targetPosition: null,
    });
  });

  it("includes fixture pet render state in the snapshot", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets.map((pet) => pet.name)).toEqual(["Alice", "Bob", "Charlie"]);
    expect(snapshot.pets[0]).toMatchObject({
      id: "pet-a",
      sourceId: "agent-a",
      name: "Alice",
      intent: "idle",
      speech: null,
    });
  });

  it("aligns pet snapshot positions with their body positions", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets[0].position).toEqual({
      x: snapshot.bodies[0].x,
      y: snapshot.bodies[0].y,
    });
  });

  it("reacts to stimuli without needing pet assets", () => {
    const scenario = createDemoScenario();
    scenario.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Approve command",
    });
    scenario.world.step(16);

    expect(scenario.world.getPet("pet-a")?.runtime.intent).toBe("seek-user");
  });

  it("reacts to a started then completed task lifecycle", () => {
    const scenario = createDemoScenario();

    scenario.world.pushStimulus({
      type: "task.started",
      sourceId: "agent-a",
      at: 10,
      summary: "Working",
    });
    scenario.world.step(16);

    expect(scenario.world.getPet("pet-a")?.runtime.intent).toBe("active");

    scenario.world.pushStimulus({
      type: "task.completed",
      sourceId: "agent-a",
      at: 20,
      summary: "Done",
    });
    scenario.world.step(16);

    expect(scenario.world.getPet("pet-a")?.runtime.intent).toBe("idle");
    expect(scenario.world.getPet("pet-a")?.runtime.speech).toBe("Done");
  });
});
