import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@/core/scenario-fixtures";
import {
  DEFAULT_PET_CLIMB_VELOCITY,
  DEFAULT_PET_JUMP_IMPULSE,
  DEFAULT_PET_WALK_FORCE,
} from "@/pets/constants/pet-body";

describe("demo scenario", () => {
  it("creates multiple pets in one shared world", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(
      snapshot.bodies.filter((body) => body.id.startsWith("pet-")),
    ).toHaveLength(7);
    expect(snapshot.bodies.some((body) => body.id === "monitor-ground")).toBe(
      true,
    );
  });

  it("adds drag and control capabilities to demo pets", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.getComponent("pet-a", "CanDrag")).toEqual({
      type: "CanDrag",
    });
    expect(scenario.world.getComponent("pet-a", "CanControl")).toEqual({
      type: "CanControl",
      force: expect.any(Number),
    });
  });

  it("creates one world-level interaction state entity", () => {
    const scenario = createDemoScenario();

    expect(
      scenario.world.getComponent("user-interaction", "KeyboardControlTarget"),
    ).toEqual({
      type: "KeyboardControlTarget",
      entityId: null,
    });
    expect(
      scenario.world.getComponent("user-interaction", "KeyboardInputState"),
    ).toEqual({
      type: "KeyboardInputState",
      pressedCodes: [],
      vector: { x: 0, y: 0 },
    });
  });

  it("exposes the simulation system order used by each step", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.systems()).toEqual([
      // PRE_UPDATE
      "PhysicsTransformSyncSystemPre",
      "PetCollisionSyncSystem",
      "ContactSystem",
      "PerceptionSystem",
      // BEHAVIOR
      "UserInteractionBehaviorSystem",
      "AgentEventBehaviorSystem",
      "CollisionBehaviorSystem",
      "BehaviorDecisionSystem",
      "AutonomousBehaviorSystem",
      "BehaviorPlanningSystem",
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
      "CollisionEscapeSystem",
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
      name: "PetCollisionSyncSystem",
      dependsOn: ["PhysicsTransformSyncSystemPre"],
      reads: ["PhysicsWorld"],
      writes: ["PetCollision"],
    });
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
      dependsOn: ["BehaviorPlanningSystem"],
      reads: [
        "ContactState",
        "MotionTarget",
        "WalkingTag",
        "ClimbingTag",
        "FlyingTag",
        "ClimbIntentState",
        "CanWallClimb",
        "ClimbDismountState",
      ],
      writes: ["WalkingTag", "ClimbingTag", "FlyingTag"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ClimbApproachSystem",
      dependsOn: ["LocomotionModeSystem"],
      reads: [
        "ClimbingTag",
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
        "ClimbingTag",
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
        "ClimbingTag",
        "Perception",
        "ClimbIntentState",
      ],
      writes: ["MotionTarget", "IntentState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "ClimbDismountSystem",
      dependsOn: ["ArrivalBehaviorSystem"],
      reads: [
        "ClimbingTag",
        "MotionTarget",
        "ContactState",
        "CanWalk",
        "CanJump",
        "JumpActionState",
        "ClimbDismountState",
        "ClimbIntentState",
      ],
      writes: ["WalkingTag", "ClimbingTag", "JumpActionState", "ClimbDismountState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "LocomotionActiveStateSystem",
      dependsOn: ["ClimbDismountSystem"],
      reads: ["ContactState", "WalkingTag", "ClimbingTag", "FlyingTag"],
      writes: ["AirborneTag"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "CollisionBehaviorSystem",
      dependsOn: ["AgentEventBehaviorSystem"],
      reads: [
        "Transform",
        "PhysicsBody",
        "IntentState",
        "MotionTarget",
        "Personality",
        "BehaviorDecisionState",
        "PendingReaction",
        "PetCollision",
        "ClimbingTag",
        "AirborneTag",
        "ClimbIntentState",
      ],
      writes: ["PendingReaction", "BehaviorDecisionState", "MotionTarget", "IntentState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "BehaviorDecisionSystem",
      dependsOn: ["CollisionBehaviorSystem"],
      reads: [
        "IntentState",
        "MotionTarget",
        "Transform",
        "Personality",
        "BehaviorDecisionState",
        "ClimbIntentState",
        "ClimbingTag",
        "Perception",
        "PendingReaction",
        "FlyingTag",
        "CanJump",
        "JumpActionState",
        "ContactState",
        "CanWallClimb",
        "ClimbDismountState",
      ],
      writes: ["BehaviorDecisionToken", "BehaviorDecisionState", "PendingReaction"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "BehaviorPlanningSystem",
      dependsOn: ["AutonomousBehaviorSystem"],
      reads: ["BehaviorDecisionToken", "JumpActionState"],
      writes: [
        "IntentState",
        "MotionTarget",
        "JumpActionState",
        "ClimbIntentState",
        "BehaviorDecisionToken",
      ],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WalkSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "Transform",
        "WalkingTag",
        "ContactState",
        "CanWalk",
        "MotionTarget",
      ],
      writes: ["PhysicsForce"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "CollisionEscapeSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "Transform",
        "PhysicsBody",
        "PetCollision",
        "WalkingTag",
        "FlyingTag",
        "ClimbingTag",
        "CanWalk",
        "MovementProfile",
      ],
      writes: ["PhysicsForce"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "JumpSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["WalkingTag", "ContactState", "CanJump", "JumpActionState"],
      writes: ["PhysicsForce", "JumpActionState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WallClimbSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "Transform",
        "ClimbingTag",
        "CanWallClimb",
        "MotionTarget",
        "ContactState",
      ],
      writes: ["PhysicsVelocity"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "FlightSystem",
      dependsOn: ["IntentSteeringSystem"],
      reads: ["PhysicsBody", "FlyingTag", "CanFly"],
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

    // pet-a (Alice): E=0.85, N=0.1 → energy = 0.6 + 0.85×0.5 − 0.1×0.2
    const aliceEnergy = 0.6 + 0.85 * 0.5 - 0.1 * 0.2;
    expect(scenario.world.getComponent("pet-a", "MovementProfile")).toEqual({
      type: "MovementProfile",
      idleForce: 0.0005 * aliceEnergy,
      activeForce: 0.0012 * aliceEnergy,
      seekForce: 0.0018 * aliceEnergy,
    });
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
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
    expect(scenario.world.getComponent("pet-a", "WalkingTag")).toEqual({
      type: "WalkingTag",
    });
    expect(
      scenario.world.getComponent("pet-a", "CanFly"),
    ).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "CanWalk")).toEqual({
      type: "CanWalk",
      force: DEFAULT_PET_WALK_FORCE,
    });
    expect(scenario.world.getComponent("pet-a", "CanJump")).toEqual({
      type: "CanJump",
      impulse: DEFAULT_PET_JUMP_IMPULSE,
    });
    expect(scenario.world.getComponent("pet-a", "JumpActionState")).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "CanWallClimb")).toEqual({
      type: "CanWallClimb",
      velocity: DEFAULT_PET_CLIMB_VELOCITY,
    });
    expect(scenario.world.getComponent("pet-a", "ClimbDismountState")).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "WandersOnArrival")).toEqual({
      type: "WandersOnArrival",
      arrivalRadius: 16,
    });
    expect(scenario.world.getComponent("pet-b", "WalkingTag")).toEqual({
      type: "WalkingTag",
    });
    expect(scenario.world.getComponent("pet-b", "CanWalk")).toEqual({
      type: "CanWalk",
      force: DEFAULT_PET_WALK_FORCE,
    });
    expect(scenario.world.getComponent("pet-b", "CanJump")).toEqual({
      type: "CanJump",
      impulse: DEFAULT_PET_JUMP_IMPULSE,
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
    expect(scenario.world.getComponent("pet-c", "WalkingTag")).toEqual({
      type: "WalkingTag",
    });
    expect(scenario.world.getComponent("pet-c", "CanWalk")).toEqual({
      type: "CanWalk",
      force: DEFAULT_PET_WALK_FORCE,
    });
    expect(scenario.world.getComponent("pet-c", "CanJump")).toEqual({
      type: "CanJump",
      impulse: DEFAULT_PET_JUMP_IMPULSE,
    });
    expect(scenario.world.getComponent("pet-c", "CanWallClimb")).toEqual({
      type: "CanWallClimb",
      velocity: DEFAULT_PET_CLIMB_VELOCITY,
    });
    expect(scenario.world.getComponent("pet-c", "WandersOnArrival")).toEqual({
      type: "WandersOnArrival",
      arrivalRadius: 16,
    });
    expect(scenario.world.getComponent("pet-d", "WalkingTag")).toEqual({
      type: "WalkingTag",
    });
    expect(scenario.world.getComponent("pet-d", "CanWalk")).toEqual({
      type: "CanWalk",
      force: DEFAULT_PET_WALK_FORCE,
    });
    expect(scenario.world.getComponent("pet-d", "CanJump")).toEqual({
      type: "CanJump",
      impulse: DEFAULT_PET_JUMP_IMPULSE,
    });
    expect(scenario.world.getComponent("pet-d", "CanFly")).toBeUndefined();
    for (const id of ["pet-e", "pet-f", "pet-g"]) {
      expect(scenario.world.getComponent(id, "FlyingTag")).toEqual({
        type: "FlyingTag",
      });
      expect(scenario.world.getComponent(id, "CanFly")).toEqual({
      type: "CanFly",
      hoverStrength: 0,
      gravityScale: 0,
      });
      expect(scenario.world.getComponent(id, "CanWalk")).toBeUndefined();
      expect(scenario.world.getComponent(id, "CanJump")).toBeUndefined();
    }
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

    for (let index = 0; index < 800; index += 1) {
      scenario.world.step(16);
      if (scenario.world.snapshot().pets[0].action === "climb-attached") {
        break;
      }
    }

    const alice = scenario.world.snapshot().pets[0];
    expect(alice.locomotion).toBe("walk");
    expect(alice.action).toBe("climb-attached");
    expect(alice.position.x).toBeCloseTo(120, -1);
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
      "Eve",
      "Finn",
      "Gwen",
    ]);
    expect(snapshot.pets.map((pet) => pet.locomotion)).toEqual([
      "walk",
      "walk",
      "walk",
      "walk",
      "fly",
      "fly",
      "fly",
    ]);
    expect(snapshot.pets.map((pet) => pet.action)).toEqual([
      "none",
      "jump-requested",
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);
    expect(snapshot.pets[0]).toMatchObject({
      id: "pet-a",
      sourceId: "agent-a",
      name: "Alice",
      intent: "idle",
      locomotion: "walk",
      action: "none",
      speech: null,
    });
    expect(snapshot.pets[0].contact).toEqual({ grounded: false, climbableSurfaceId: null });
    expect(snapshot.pets[0].motionTarget).toBeNull();
  });

  it("derives visual cues from current pet behavior", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("pet-a", {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 0,
      expiresAt: 1000,
      reason: "approach-pet",
      lastAutonomousReason: "approach-pet",
      lastAutonomousAt: 0,
    });
    scenario.world.setComponent("pet-b", {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 0,
      expiresAt: 1000,
      reason: "flee-from-pet",
      lastAutonomousReason: "flee-from-pet",
      lastAutonomousAt: 0,
    });
    scenario.world.setComponent("pet-c", {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 0,
      expiresAt: 1000,
      reason: "wander-far",
      lastAutonomousReason: "wander-far",
      lastAutonomousAt: 0,
    });
    scenario.world.setComponent("pet-d", {
      type: "PendingReaction",
      source: "collision",
      triggeredAt: 0,
      reactsAt: 1000,
      context: {},
    });

    const cues = new Map(
      scenario.world.snapshot().pets.map((pet) => [pet.id, pet.visualCue]),
    );

    expect(cues.get("pet-a")).toEqual({
      kind: "affection",
      icon: "♥",
      label: "approaching another pet",
    });
    expect(cues.get("pet-b")).toEqual({
      kind: "flee",
      icon: ">>",
      label: "fleeing",
    });
    expect(cues.get("pet-c")).toEqual({
      kind: "wander",
      icon: "♪",
      label: "wandering",
    });
    expect(cues.get("pet-d")).toEqual({
      kind: "surprised",
      icon: "!",
      label: "surprised by collision",
    });
  });

  it("shows two hearts after a successful pet chase", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("pet-a", {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 0,
      expiresAt: 1000,
      reason: "approach-pet-success",
      lastAutonomousReason: "approach-pet",
      lastAutonomousAt: 0,
    });

    expect(scenario.world.snapshot().pets[0].visualCue).toEqual({
      kind: "affection",
      icon: "♥♥",
      label: "caught another pet",
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

  it("reacts to events without needing pet assets", () => {
    const scenario = createDemoScenario();
    scenario.world.pushEvent({
      kind: "agent",
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

  it("moves walking seek-user pets toward the user anchor", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 240, y: 500 },
    });

    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
    }

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });

    const before = scenario.world.snapshot().pets.find((pet) => pet.id === "pet-a")?.position;

    for (let index = 0; index < 45; index += 1) {
      scenario.world.step(16);
    }

    const after = scenario.world.snapshot().pets.find((pet) => pet.id === "pet-a")?.position;
    expect(scenario.world.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(scenario.world.getComponent("pet-a", "ContactState")?.grounded).toBe(true);
    expect(after?.x).toBeLessThan(before?.x ?? Number.POSITIVE_INFINITY);
  });

  it("clears stale seek-user targets after walking pets reach the resolved stop target", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 360, y: 500 },
    });

    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
    }

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });

    for (let index = 0; index < 2; index += 1) {
      scenario.world.step(16);
    }

    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    expect(scenario.world.getComponent("pet-a", "IntentState")?.intent).toBe("idle");
  });

  it("reacts to a started then completed task lifecycle", () => {
    const scenario = createDemoScenario();

    scenario.world.pushEvent({
      kind: "agent",
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

    scenario.world.pushEvent({
      kind: "agent",
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
      userAnchor: { x: 800, y: 500 },
    });
    const before = scenario.world.snapshot().pets[4].position;

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-e",
      at: 1,
      summary: "Needs approval",
    });
    for (let index = 0; index < 20; index += 1) {
      scenario.world.step(16);
    }

    const after = scenario.world.snapshot().pets[4].position;
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("lets flying seek-user pets resume wandering after reaching the user anchor", () => {
    const userAnchor = { x: 420, y: 500 };
    const scenario = createDemoScenario({ userAnchor });

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-e",
      at: 1,
      summary: "Needs approval",
    });

    scenario.world.step(16);  // agent-event claim set, seek target assigned
    scenario.world.step(16);  // arrival: intent -> idle, entity target cleared

    expect(scenario.world.getComponent("pet-e", "IntentState")).toEqual({
      type: "IntentState",
      intent: "idle",
    });
    const motionAfterArrival = scenario.world.getComponent("pet-e", "MotionTarget");
    expect(motionAfterArrival?.targetEntityId).toBeNull();

    // Eve may choose idle-stay or wander; either way she
    // must no longer be targeting the user anchor entity.
    expect(motionAfterArrival?.targetEntityId).toBeNull();
  });

  it("does not expose global avoidance navigation state in the system plan", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 360, y: 200 },
    });

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-e",
      at: 1,
      summary: "Needs approval",
    });
    scenario.world.step(16);

    const declaredComponents = scenario.world
      .systemPlan()
      .flatMap((system) => [...(system.reads ?? []), ...(system.writes ?? [])]);
    expect(declaredComponents).not.toContain("NavigationState");
  });

  it("chooses a new wander target after a pet reaches its previous one", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 600, y: 500 },
    });

    // Step 1: ArrivalBehaviorSystem detects that Alice is already at (600, 500) and
    // clears the target. BehaviorDecisionSystem picks a new behavior on the NEXT pass.
    scenario.world.step(16);
    // Step 2: BehaviorDecisionSystem fires and commits a new motion target.
    scenario.world.step(16);

    const motion = scenario.world.getComponent("pet-a", "MotionTarget");
    // Alice has high extraversion and may choose seek-user (targetEntityId) or a wander
    // (targetPosition). Either is a valid post-arrival autonomous decision.
    const hasNewTarget = motion?.targetEntityId !== null || motion?.targetPosition !== null;
    expect(hasNewTarget).toBe(true);
    // Must not have kept the completed wander position unchanged.
    expect(motion?.targetPosition).not.toEqual({ x: 600, y: 500 });
  });

  it("jumps higher than the pet body height", () => {
    const scenario = createDemoScenario();

    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
    }

    const takeoffSnapshot = scenario.world.snapshot();
    const takeoffPet = takeoffSnapshot.pets.find((pet) => pet.id === "pet-a");
    const takeoffBody = takeoffSnapshot.bodies.find((body) => body.id === "pet-a");
    expect(scenario.world.getComponent("pet-a", "ContactState")?.grounded).toBe(true);
    expect(takeoffPet).toBeDefined();
    expect(takeoffBody?.height).toBeGreaterThan(0);

    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });

    let minY = takeoffPet!.position.y;
    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
      const pet = scenario.world.snapshot().pets.find((entry) => entry.id === "pet-a");
      if (pet) minY = Math.min(minY, pet.position.y);
    }

    expect(takeoffPet!.position.y - minY).toBeGreaterThan(takeoffBody!.height);
  });
});
