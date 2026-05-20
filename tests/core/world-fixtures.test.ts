import { describe, expect, it } from "vitest";
import { MOTION_ARRIVAL_RADIUS } from "@/core/systems/intent-steering-system";
import { createDemoScenario } from "@/core/world/scenario-fixtures";

describe("demo scenario", () => {
  it("creates multiple pets in one shared world", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.bodies.filter((body) => body.id.startsWith("pet-"))).toHaveLength(4);
    expect(snapshot.bodies.some((body) => body.id === "monitor-ground")).toBe(true);
  });

  it("exposes the simulation system order used by each step", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.systems()).toEqual([
      "StimulusReactionSystem",
      "IdleConversationSystem",
      "PhysicsTransformSyncSystem",
      "MotionTargetSystem",
      "AvoidancePlanningSystem",
      "WalkSystem",
      "JumpSystem",
      "WallClimbSystem",
      "IntentSteeringSystem",
      "FlightSystem",
      "PhysicsIntegrationSystem",
      "PhysicsTransformSyncSystem",
    ]);
  });

  it("exposes system metadata for validation and documentation", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WalkSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["Transform", "LocomotionState", "WalkMovement", "MotionTarget", "NavigationState"],
      writes: ["PhysicsForce"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "JumpSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["LocomotionState", "JumpMovement", "JumpState"],
      writes: ["PhysicsForce", "JumpState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WallClimbSystem",
      dependsOn: ["AvoidancePlanningSystem"],
      reads: ["Transform", "LocomotionState", "WallClimbMovement", "MotionTarget"],
      writes: ["PhysicsForce"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "FlightSystem",
      dependsOn: ["IntentSteeringSystem"],
      reads: ["PhysicsBody", "LocomotionState", "FlightMovement"],
      writes: ["PhysicsGravityScale"],
    });
  });

  it("creates a configurable user anchor entity", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 480, y: 500 },
    });

    expect(scenario.world.getEntity("user-anchor")).toEqual({ id: "user-anchor" });
    expect(scenario.world.getComponent("user-anchor", "UserAnchor")).toEqual({
      type: "UserAnchor",
    });
    expect(scenario.world.getComponent("user-anchor", "Transform")).toEqual({
      type: "Transform",
      position: { x: 480, y: 500 },
    });
  });

  it("gives fixture pets ECS components for movement profiles and motion state", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.getComponent("pet-a", "MovementProfile")).toEqual({
      type: "MovementProfile",
      idleSpeed: 0.0006,
      activeSpeed: 0.0012,
      seekSpeed: 0.0018,
    });
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    expect(scenario.world.getComponent("pet-a", "NavigationState")).toEqual({
      type: "NavigationState",
      avoidanceWaypoint: null,
    });
    expect(scenario.world.getComponent("pet-a", "SpeechProfile")).toEqual({
      type: "SpeechProfile",
      idleCompanion: "Still here with you.",
      attentionNeeded: "I need you.",
      taskStarted: "Working on it.",
      taskCompleted: "Done.",
    });
    expect(scenario.world.getComponent("pet-a", "IdleConversation")).toEqual({
      type: "IdleConversation",
      idleAfterMs: 5_000,
    });
    expect(scenario.world.getComponent("pet-a", "CompletionBehavior")).toEqual({
      type: "CompletionBehavior",
      intentAfterCompletion: "idle",
    });
    expect(scenario.world.getComponent("pet-a", "LocomotionState")).toEqual({
      type: "LocomotionState",
      baseMode: "walk",
    });
    expect(scenario.world.getComponent("pet-a", "FlightMovement")).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "WalkMovement")).toEqual({
      type: "WalkMovement",
      speed: 0.01,
    });
    expect(scenario.world.getComponent("pet-a", "JumpMovement")).toEqual({
      type: "JumpMovement",
      impulse: 0.014,
    });
    expect(scenario.world.getComponent("pet-a", "JumpState")).toEqual({
      type: "JumpState",
      pending: false,
    });
    expect(scenario.world.getComponent("pet-a", "WallClimbMovement")).toEqual({
      type: "WallClimbMovement",
      speed: 0.004,
    });
    expect(scenario.world.getComponent("pet-b", "LocomotionState")).toEqual({
      type: "LocomotionState",
      baseMode: "walk",
    });
    expect(scenario.world.getComponent("pet-b", "JumpMovement")).toEqual({
      type: "JumpMovement",
      impulse: 0.014,
    });
    expect(scenario.world.getComponent("pet-b", "JumpState")).toEqual({
      type: "JumpState",
      pending: true,
    });
    expect(scenario.world.getComponent("pet-c", "LocomotionState")).toEqual({
      type: "LocomotionState",
      baseMode: "climb",
    });
    expect(scenario.world.getComponent("pet-c", "WallClimbMovement")).toEqual({
      type: "WallClimbMovement",
      speed: 0.004,
    });
    expect(scenario.world.getComponent("pet-d", "LocomotionState")).toEqual({
      type: "LocomotionState",
      baseMode: "fly",
    });
    expect(scenario.world.getComponent("pet-d", "FlightMovement")).toEqual({
      type: "FlightMovement",
      hoverStrength: 0,
      gravityScale: 0,
    });
  });

  it("models the monitor bottom as a ground entity", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.getComponent("monitor-ground", "Ground")).toEqual({
      type: "Ground",
    });
    expect(scenario.world.getComponent("monitor-ground", "PhysicsMaterial")).toEqual({
      type: "PhysicsMaterial",
      friction: 0.8,
      restitution: 0,
    });
  });

  it("includes fixture pet render state in the snapshot", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets.map((pet) => pet.name)).toEqual(["Alice", "Bob", "Charlie", "Dana"]);
    expect(snapshot.pets.map((pet) => pet.locomotion)).toEqual(["walk", "walk", "climb", "fly"]);
    expect(snapshot.pets[0]).toMatchObject({
      id: "pet-a",
      sourceId: "agent-a",
      name: "Alice",
      intent: "idle",
      locomotion: "walk",
      speech: null,
    });
  });

  it("aligns pet snapshot positions with their body positions", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();
    const petBody = snapshot.bodies.find((body) => body.id === "pet-a");

    expect(snapshot.pets[0].position).toEqual({
      x: petBody?.x,
      y: petBody?.y,
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

    expect(scenario.world.getComponent("pet-a", "IntentState")).toEqual({
      type: "IntentState",
      intent: "seek",
    });
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

    expect(scenario.world.getComponent("pet-a", "IntentState")).toEqual({
      type: "IntentState",
      intent: "active",
    });

    scenario.world.pushStimulus({
      type: "task.completed",
      sourceId: "agent-a",
      at: 20,
      summary: "Done",
    });
    scenario.world.step(16);

    expect(scenario.world.getComponent("pet-a", "IntentState")).toEqual({
      type: "IntentState",
      intent: "idle",
    });
    expect(scenario.world.getComponent("pet-a", "SpeechState")).toEqual({
      type: "SpeechState",
      speech: "Done",
    });
  });

  it("moves flying seek-user pets toward the user anchor", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 480, y: 500 },
    });
    const before = scenario.world.snapshot().pets[3].position;

    scenario.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-d",
      at: 1,
      summary: "Needs approval",
    });
    for (let index = 0; index < 20; index += 1) {
      scenario.world.step(16);
    }

    const after = scenario.world.snapshot().pets[3].position;
    expect(after.y).toBeGreaterThan(before.y);
  });

  it("lets flying seek-user pets settle near the user anchor", () => {
    const userAnchor = { x: 200, y: 200 };
    const scenario = createDemoScenario({ userAnchor });

    scenario.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-d",
      at: 1,
      summary: "Needs approval",
    });

    for (let index = 0; index < 200; index += 1) {
      scenario.world.step(16);
    }

    const body = scenario.world.snapshot().bodies.find((snapshotBody) => snapshotBody.id === "pet-d");
    const distanceFromAnchor = Math.hypot((body?.x ?? 0) - userAnchor.x, (body?.y ?? 0) - userAnchor.y);
    const speed = Math.hypot(body?.vx ?? 0, body?.vy ?? 0);

    expect(distanceFromAnchor).toBeLessThanOrEqual(MOTION_ARRIVAL_RADIUS + 2);
    expect(speed).toBeLessThan(0.05);
  });

  it("plans an avoidance waypoint when another pet blocks the target path", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 360, y: 200 },
    });

    scenario.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-d",
      at: 1,
      summary: "Needs approval",
    });
    scenario.world.step(16);

    const navigation = scenario.world.getComponent("pet-d", "NavigationState");
    expect(navigation?.avoidanceWaypoint).toEqual({
      x: 280,
      y: 128,
    });
  });
});
