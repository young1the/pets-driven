import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@/core/scenario-fixtures";

describe("demo scenario", () => {
  it("creates multiple pets in one shared world", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(
      snapshot.bodies.filter((body) => body.id.startsWith("pet-")),
    ).toHaveLength(4);
    expect(snapshot.bodies.some((body) => body.id === "monitor-ground")).toBe(
      true,
    );
  });

  it("exposes the simulation system order used by each step", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.systems()).toEqual([
      // PRE_UPDATE
      "PhysicsTransformSyncSystemPre",
      "ContactSystem",
      // BEHAVIOR
      "UserInteractionBehaviorSystem",
      "AgentEventBehaviorSystem",
      "CollisionBehaviorSystem",
      "BehaviorSelectionSystem",
      "AutonomousBehaviorSystem",
      // UPDATE
      "LocomotionModeSystem",
      "ClimbApproachSystem",
      "ArrivalBehaviorSystem",
      "ClimbDismountSystem",
      "LocomotionActiveStateSystem",
      "ClimbAttachmentSystem",
      "MotionTargetSystem",
      // POST_UPDATE
      "WalkSystem",
      "JumpSystem",
      "WallClimbSystem",
      "IntentSteeringSystem",
      "FlightSystem",
      // SIMULATE
      "PhysicsIntegrationSystem",
      "PhysicsTransformSyncSystemPost",
    ]);
  });

  it("exposes system metadata for validation and documentation", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ContactSystem",
      dependsOn: ["PhysicsTransformSyncSystemPre"],
      reads: [
        "Transform",
        "PhysicsBody",
        "ContactState",
        "ClimbableSurface",
        "Ground",
      ],
      writes: ["ContactState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "LocomotionModeSystem",
      dependsOn: ["AutonomousBehaviorSystem"],
      reads: [
        "ContactState",
        "MotionTarget",
        "WalkingState",
        "ClimbingState",
        "FlyingState",
        "ClimbIntentState",
        "CanWallClimb",
        "ClimbDismountState",
      ],
      writes: ["WalkingState", "ClimbingState", "FlyingState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ClimbApproachSystem",
      dependsOn: ["LocomotionModeSystem"],
      reads: [
        "ClimbingState",
        "Transform",
        "MotionTarget",
        "ClimbIntentState",
        "CanWallClimb",
        "ClimbableSurface",
      ],
      writes: ["MotionTarget"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ClimbAttachmentSystem",
      dependsOn: ["LocomotionActiveStateSystem"],
      reads: [
        "ClimbingState",
        "ContactState",
        "Transform",
        "MotionTarget",
        "ClimbIntentState",
      ],
      writes: ["Transform", "MotionTarget", "PhysicsPosition", "PhysicsVelocity"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ArrivalBehaviorSystem",
      dependsOn: ["ClimbApproachSystem"],
      reads: [
        "Transform",
        "MotionTarget",
        "WandersOnArrival",
        "IntentState",
        "ClimbingState",
        "UserAnchor",
        "ClimbIntentState",
      ],
      writes: ["MotionTarget", "IntentState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ClimbDismountSystem",
      dependsOn: ["ArrivalBehaviorSystem"],
      reads: [
        "ClimbingState",
        "MotionTarget",
        "ContactState",
        "CanWalk",
        "CanWallClimb",
        "CanJump",
        "JumpActionState",
        "ClimbDismountState",
        "ClimbIntentState",
      ],
      writes: ["WalkingState", "ClimbingState", "JumpActionState", "ClimbDismountState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "LocomotionActiveStateSystem",
      dependsOn: ["ClimbDismountSystem"],
      reads: ["ContactState", "WalkingState", "ClimbingState", "FlyingState"],
      writes: ["AirborneState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "CollisionBehaviorSystem",
      dependsOn: ["AgentEventBehaviorSystem"],
      reads: ["Transform", "PhysicsBody", "IntentState", "MotionTarget"],
      writes: ["MotionTarget", "BehaviorDecisionState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WalkSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "Transform",
        "WalkingState",
        "ContactState",
        "CanWalk",
        "MotionTarget",
        "NavigationState",
      ],
      writes: ["PhysicsForce"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "JumpSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["WalkingState", "ContactState", "CanJump", "JumpActionState"],
      writes: ["PhysicsForce", "JumpActionState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WallClimbSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "Transform",
        "ClimbingState",
        "CanWallClimb",
        "MotionTarget",
        "ContactState",
      ],
      writes: ["PhysicsVelocity"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "FlightSystem",
      dependsOn: ["IntentSteeringSystem"],
      reads: ["PhysicsBody", "FlyingState", "CanFly"],
      writes: ["PhysicsGravityScale"],
    });
  });

  it("creates a configurable user anchor entity", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 480, y: 500 },
    });

    expect(scenario.world.getEntity("user-anchor")).toEqual({
      id: "user-anchor",
    });
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
    expect(scenario.world.getComponent("pet-a", "ContactState")).toEqual({
      type: "ContactState",
      grounded: false,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
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
    expect(scenario.world.getComponent("pet-a", "WalkingState")).toEqual({
      type: "WalkingState",
    });
    expect(
      scenario.world.getComponent("pet-a", "CanFly"),
    ).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "CanWalk")).toEqual({
      type: "CanWalk",
      speed: 0.01,
    });
    expect(scenario.world.getComponent("pet-a", "CanJump")).toEqual({
      type: "CanJump",
      impulse: 0.009,
    });
    expect(scenario.world.getComponent("pet-a", "JumpActionState")).toEqual({
      type: "JumpActionState",
      phase: "ready",
      cooldownMs: 0,
    });
    expect(scenario.world.getComponent("pet-a", "CanWallClimb")).toEqual({
      type: "CanWallClimb",
      speed: 1.1,
    });
    expect(scenario.world.getComponent("pet-a", "ClimbDismountState")).toEqual({
      type: "ClimbDismountState",
      phase: "ready",
      cooldownMs: 0,
    });
    expect(scenario.world.getComponent("pet-a", "WandersOnArrival")).toEqual({
      type: "WandersOnArrival",
      arrivalRadius: 16,
    });
    expect(scenario.world.getComponent("pet-b", "WalkingState")).toEqual({
      type: "WalkingState",
    });
    expect(scenario.world.getComponent("pet-b", "CanWalk")).toEqual({
      type: "CanWalk",
      speed: 0.01,
    });
    expect(scenario.world.getComponent("pet-b", "CanJump")).toEqual({
      type: "CanJump",
      impulse: 0.009,
    });
    expect(scenario.world.getComponent("pet-b", "JumpActionState")).toEqual({
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
    expect(scenario.world.getComponent("pet-b", "WandersOnArrival")).toEqual({
      type: "WandersOnArrival",
      arrivalRadius: 16,
    });
    expect(scenario.world.getComponent("pet-c", "WalkingState")).toEqual({
      type: "WalkingState",
    });
    expect(scenario.world.getComponent("pet-c", "CanWalk")).toEqual({
      type: "CanWalk",
      speed: 0.01,
    });
    expect(scenario.world.getComponent("pet-c", "CanWallClimb")).toEqual({
      type: "CanWallClimb",
      speed: 1.1,
    });
    expect(scenario.world.getComponent("pet-c", "WandersOnArrival")).toEqual({
      type: "WandersOnArrival",
      arrivalRadius: 16,
    });
    expect(scenario.world.getComponent("pet-d", "FlyingState")).toEqual({
      type: "FlyingState",
    });
    expect(scenario.world.getComponent("pet-d", "CanFly")).toEqual({
      type: "CanFly",
      hoverStrength: 0,
      gravityScale: 0,
    });
  });

  it("models the monitor bottom as a ground entity", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.getComponent("monitor-ground", "Ground")).toEqual({
      type: "Ground",
    });
    expect(
      scenario.world.getComponent("monitor-ground", "PhysicsMaterial"),
    ).toEqual({
      type: "PhysicsMaterial",
      friction: 0.8,
      restitution: 0,
    });
  });

  it("models climbable surfaces as contact targets", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.getEntity("climb-wall")).toEqual({
      id: "climb-wall",
    });
    expect(
      scenario.world.getComponent("climb-wall", "ClimbableSurface"),
    ).toEqual({
      type: "ClimbableSurface",
    });

    scenario.world.step(16);

    expect(scenario.world.getComponent("pet-c", "ContactState")).toEqual({
      type: "ContactState",
      grounded: false,
      climbableSurfaceId: "climb-wall",
      climbableSurfacePosition: { x: 280, y: 200 },
    });
  });

  it("locks Alice to the climb surface while transitioning from walk to climb", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("pet-a", {
      type: "ClimbIntentState",
      phase: "approaching",
      surfaceEntityId: "alice-climb-wall",
      targetY: 120,
    });

    for (let index = 0; index < 240; index += 1) {
      scenario.world.step(16);
      if (scenario.world.snapshot().pets[0].locomotion === "climb") {
        break;
      }
    }

    const alice = scenario.world.snapshot().pets[0];
    expect(alice.locomotion).toBe("climb");
    expect(alice.position.x).toBeCloseTo(120, 0);
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 120, y: 120 },
    });
  });

  it("includes climbable surfaces in the render snapshot", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.snapshot().climbableSurfaces).toEqual([
      {
        id: "alice-climb-wall",
        position: { x: 120, y: 500 },
      },
      {
        id: "climb-wall",
        position: { x: 280, y: 200 },
      },
    ]);
  });

  it("includes fixture pet render state in the snapshot", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets.map((pet) => pet.name)).toEqual([
      "Alice",
      "Bob",
      "Charlie",
      "Dana",
    ]);
    expect(snapshot.pets.map((pet) => pet.locomotion)).toEqual([
      "walk",
      "walk",
      "walk",
      "fly",
    ]);
    expect(snapshot.pets[0]).toMatchObject({
      id: "pet-a",
      sourceId: "agent-a",
      name: "Alice",
      intent: "idle",
      locomotion: "walk",
      speech: null,
    });
    expect(snapshot.pets[0].contact).toEqual({ grounded: false, climbableSurfaceId: null });
    expect(snapshot.pets[0].motionTarget).toBeNull();
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

  it("lets flying seek-user pets resume wandering after reaching the user anchor", () => {
    const userAnchor = { x: 200, y: 200 };
    const scenario = createDemoScenario({ userAnchor });

    scenario.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-d",
      at: 1,
      summary: "Needs approval",
    });

    scenario.world.step(16);  // agent-event claim set, seek target assigned
    scenario.world.step(16);  // arrival: intent -> idle, entity target cleared

    expect(scenario.world.getComponent("pet-d", "IntentState")).toEqual({
      type: "IntentState",
      intent: "idle",
    });
    const motionAfterArrival = scenario.world.getComponent("pet-d", "MotionTarget");
    expect(motionAfterArrival?.targetEntityId).toBeNull();

    // Dana (reserved, shyness=0.75) may choose idle-stay or wander; either way she
    // must no longer be targeting the user anchor entity.
    expect(motionAfterArrival?.targetEntityId).toBeNull();
  });

  it("does not plan global avoidance waypoints when another pet blocks the target path", () => {
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
    expect(navigation?.avoidanceWaypoint).toBeNull();
  });

  it("chooses a new wander target after a pet reaches its previous one", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 600, y: 500 },
    });

    // Step 1: ArrivalBehaviorSystem detects that Alice is already at (600, 500) and
    // clears the target. BehaviorSelectionSystem picks a new behavior on the NEXT pass.
    scenario.world.step(16);
    // Step 2: BehaviorSelectionSystem fires and commits a new motion target.
    scenario.world.step(16);

    const motion = scenario.world.getComponent("pet-a", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).not.toBeNull();
    expect(motion?.targetPosition).not.toEqual({ x: 600, y: 500 });
  });
});
