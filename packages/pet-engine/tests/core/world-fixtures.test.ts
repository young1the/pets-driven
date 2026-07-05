import { describe, expect, it } from "vitest";
import {
  createAdoptedPetsScenario,
  createDemoScenario,
  createClimbPlaygroundScenario,
  createJumpPlaygroundScenario,
  deriveJumpForwardImpulse,
  deriveMovementProfile,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import {
  DEFAULT_PET_CLIMB_VELOCITY,
  DEFAULT_PET_CONTROL_SPEED,
  DEFAULT_PET_JUMP_IMPULSE,
  DEFAULT_PET_WALK_FORCE,
} from "@pets-driven/pet-engine/pets/constants/pet-body";

const playfulPersonality = {
  type: "Personality" as const,
  openness: 0.7,
  conscientiousness: 0.4,
  extraversion: 0.85,
  agreeableness: 0.5,
  neuroticism: 0.1,
};

const attentivePersonality = {
  type: "Personality" as const,
  openness: 0.3,
  conscientiousness: 0.6,
  extraversion: 0.8,
  agreeableness: 0.8,
  neuroticism: 0.2,
};

const reservedPersonality = {
  type: "Personality" as const,
  openness: 0.3,
  conscientiousness: 0.5,
  extraversion: 0.2,
  agreeableness: 0.4,
  neuroticism: 0.75,
};

function monitorOf(position: { x: number; y: number }) {
  if (position.x < 0 && position.y <= 960) return "left";
  if (position.x >= 0) return "primary";
  return "gap";
}

function runUntilPetReachesLeftMonitor(
  scenario: ReturnType<typeof createDemoScenario>,
  petId: string,
  maxFrames: number,
) {
  let minX = Infinity;
  let maxY = -Infinity;
  for (let frame = 1; frame <= maxFrames; frame += 1) {
    scenario.clock.advanceBy(16);
    scenario.world.step(16);
    const pet = scenario.world
      .snapshot()
      .pets.find((entry) => entry.id === petId);
    if (pet) {
      minX = Math.min(minX, pet.position.x);
      maxY = Math.max(maxY, pet.position.y);
    }
    if (pet && monitorOf(pet.position) === "left") {
      return { frame, pet, minX, maxY };
    }
  }

  return null;
}

/**
 * Put pet-c back into the dual-monitor fixture's scripted seam climb: attached
 * to the seam climb-wall, heading for the top, ready to dismount leftward.
 * Mirrors the initial dual-horizontal fixture state for pet-c.
 */
function scriptSeamClimb(scenario: ReturnType<typeof createDemoScenario>): void {
  scenario.world.setPhysicsPosition("pet-c", { x: 24, y: 840 });
  scenario.world.setPhysicsVelocity("pet-c", { x: 0, y: 0 });
  scenario.world.removeComponent("pet-c", "ClimbDismountState");
  scenario.world.removeComponent("pet-c", "JumpActionState");
  scenario.world.setComponent("pet-c", { type: "ClimbingTag" });
  scenario.world.setComponent("pet-c", {
    type: "IntentState",
    intent: "active",
  });
  scenario.world.setComponent("pet-c", {
    type: "ContactState",
    grounded: false,
    climbableSurfaceId: "climb-wall",
    climbableSurfacePosition: { x: 24, y: 840 },
  });
  scenario.world.setComponent("pet-c", {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: { x: 24, y: 160 },
  });
  scenario.world.setComponent("pet-c", {
    type: "ClimbIntentState",
    phase: "attached",
    surfaceEntityId: "climb-wall",
    targetY: 160,
  });
}

function runPetPath(
  scenario: ReturnType<typeof createDemoScenario>,
  petId: string,
  maxFrames: number,
) {
  let minX = Infinity;
  let maxY = -Infinity;

  for (let frame = 1; frame <= maxFrames; frame += 1) {
    scenario.clock.advanceBy(16);
    scenario.world.step(16);
    const pet = scenario.world
      .snapshot()
      .pets.find((entry) => entry.id === petId);
    if (pet) {
      minX = Math.min(minX, pet.position.x);
      maxY = Math.max(maxY, pet.position.y);
    }
  }

  return { minX, maxY };
}

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
      speed: DEFAULT_PET_CONTROL_SPEED,
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

  it("marks dragged pets with an interaction scale cue", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("user-interaction", {
      type: "DragInteraction",
      pointerId: 1,
      entityId: "pet-a",
      phase: "dragging",
      grabOffset: { x: 0, y: 0 },
      pointerPosition: { x: 600, y: 500 },
      startedAt: 0,
      samples: [],
    });

    const pet = scenario.world
      .snapshot()
      .pets.find((entry) => entry.id === "pet-a");

    expect(pet?.interaction).toEqual({
      controllable: true,
      dragged: true,
      selected: false,
      controlled: false,
      scale: 1.12,
    });
  });

  it("marks controllable pets before selection", () => {
    const scenario = createDemoScenario();
    const pet = scenario.world
      .snapshot()
      .pets.find((entry) => entry.id === "pet-a");

    expect(pet?.interaction).toEqual({
      controllable: true,
      dragged: false,
      selected: false,
      controlled: false,
      scale: undefined,
    });
  });

  it("exposes the simulation system order used by each step", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.systems()).toEqual([
      // PRE_UPDATE
      "PhysicsTransformSyncSystemPre",
      "PetCollisionSyncSystem",
      "ContactSystem",
      "CursorInputSystem",
      "PerceptionSystem",
      // BEHAVIOR
      "UserInteractionBehaviorSystem",
      "PettingDetectionSystem",
      "SpeechExpirationSystem",
      "PetExpressionExpirationSystem",
      "AgentTaskEventSystem",
      "CollisionBehaviorSystem",
      "WorkingBehaviorSystem",
      "SocialInteractionSystem",
      "BehaviorDecisionSystem",
      "AutonomousBehaviorSystem",
      "BehaviorPlanningSystem",
      "RompProgressSystem",
      // UPDATE
      "LocomotionModeSystem",
      "ClimbApproachSystem",
      "ArrivalBehaviorSystem",
      "ClimbDismountSystem",
      "LocomotionActiveStateSystem",
      "ClimbAttachmentSystem",
      "MotionTargetSystem",
      "DriveDecaySystem",
      // POST_UPDATE
      "TaskMovementHoldSystem",
      "WalkSystem",
      "CollisionEscapeSystem",
      "JumpSystem",
      "WallClimbSystem",
      "IntentSteeringSystem",
      "KeyboardControlMovementSystem",
      "FlightSystem",
      "DraggedEntityKinematicSystem",
      "ThrowImpulseSystem",
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
      writes: [
        "Transform",
        "MotionTarget",
        "PhysicsPosition",
        "PhysicsVelocity",
      ],
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
        "Personality",
        "BehaviorDecisionState",
      ],
      writes: [
        "MotionTarget",
        "IntentState",
        "PetExpressionState",
        "Drives",
        "BehaviorDecisionState",
      ],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "DriveDecaySystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["Drives", "IntentState"],
      writes: ["Drives"],
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
        "CanWallClimb",
        "JumpActionState",
        "ClimbDismountState",
        "ClimbIntentState",
      ],
      writes: [
        "WalkingTag",
        "ClimbingTag",
        "JumpActionState",
        "ClimbDismountState",
        "PhysicsForce",
      ],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "LocomotionActiveStateSystem",
      dependsOn: ["ClimbDismountSystem"],
      reads: ["ContactState", "WalkingTag", "ClimbingTag", "FlyingTag"],
      writes: ["AirborneTag"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "PetExpressionExpirationSystem",
      dependsOn: ["SpeechExpirationSystem"],
      reads: ["PetExpressionState"],
      writes: ["PetExpressionState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "AgentTaskEventSystem",
      dependsOn: ["PetExpressionExpirationSystem"],
      reads: ["AgentBinding", "SpeechProfile", "SpeechState", "ActivityState"],
      writes: [
        "AgentTaskState",
        "AgentChannelState",
        "SpeechState",
        "ActivityState",
        "BehaviorDecisionState",
        "TaskMovementHold",
      ],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "CollisionBehaviorSystem",
      dependsOn: ["AgentTaskEventSystem"],
      reads: [
        "Transform",
        "PhysicsBody",
        "IntentState",
        "MotionTarget",
        "Personality",
        "BehaviorDecisionState",
        "PendingReaction",
        "PetCollision",
        "AgentTaskState",
        "ClimbingTag",
        "AirborneTag",
        "ClimbIntentState",
        "SocialSessionMember",
        "CollisionMemory",
      ],
      writes: [
        "PendingReaction",
        "BehaviorDecisionState",
        "MotionTarget",
        "IntentState",
        "PetExpressionState",
        "CollisionMemory",
      ],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "WorkingBehaviorSystem",
      dependsOn: ["CollisionBehaviorSystem"],
      reads: [
        "AgentTaskState",
        "Personality",
        "MotionTarget",
        "Transform",
        "BehaviorDecisionState",
        "PhysicsBody",
      ],
      writes: ["MotionTarget", "IntentState", "BehaviorDecisionState"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "BehaviorDecisionSystem",
      dependsOn: ["WorkingBehaviorSystem"],
      reads: [
        "IntentState",
        "MotionTarget",
        "Transform",
        "Personality",
        "BehaviorDecisionState",
        "AgentTaskState",
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
        "Drives",
      ],
      writes: [
        "BehaviorDecisionToken",
        "BehaviorDecisionState",
        "PendingReaction",
      ],
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
        "Drives",
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
        "SocialSessionMember",
      ],
      writes: ["PhysicsForce"],
    });
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "JumpSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: [
        "WalkingTag",
        "Transform",
        "MotionTarget",
        "ContactState",
        "CanJump",
        "JumpActionState",
      ],
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
    expect(scenario.world.systemPlan()).toContainEqual({
      name: "TaskMovementHoldSystem",
      dependsOn: ["MotionTargetSystem"],
      reads: ["TaskMovementHold"],
      writes: ["MotionTarget", "PhysicsVelocity"],
    });
  });

  it("allows fixture pet physics bodies to be sized for desktop projection", () => {
    const scenario = createDemoScenario({
      petBodySize: { width: 78, height: 82 },
    });

    expect(scenario.world.getComponent("pet-a", "PhysicsBody")).toEqual({
      type: "PhysicsBody",
      shape: "rectangle",
      width: 78,
      height: 82,
    });
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-a"),
    ).toMatchObject({
      width: 78,
      height: 82,
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
    expect(scenario.world.getComponent("pet-a", "CanFly")).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "CanWalk")).toEqual({
      type: "CanWalk",
      force: DEFAULT_PET_WALK_FORCE,
    });
    expect(scenario.world.getComponent("pet-a", "CanJump")).toEqual({
      type: "CanJump",
      impulse: DEFAULT_PET_JUMP_IMPULSE,
      forwardImpulse: deriveJumpForwardImpulse(playfulPersonality),
    });
    expect(
      scenario.world.getComponent("pet-a", "JumpActionState"),
    ).toBeUndefined();
    expect(scenario.world.getComponent("pet-a", "CanWallClimb")).toEqual({
      type: "CanWallClimb",
      velocity: DEFAULT_PET_CLIMB_VELOCITY,
    });
    expect(
      scenario.world.getComponent("pet-a", "ClimbDismountState"),
    ).toBeUndefined();
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
      forwardImpulse: deriveJumpForwardImpulse(attentivePersonality),
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
      forwardImpulse: deriveJumpForwardImpulse(playfulPersonality),
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
      forwardImpulse: deriveJumpForwardImpulse(reservedPersonality),
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

  it("models monitor side and top boundaries as ground entities", () => {
    const scenario = createDemoScenario();

    expect(scenario.world.getComponent("monitor-left-wall", "Ground")).toEqual({
      type: "Ground",
    });
    expect(scenario.world.getComponent("monitor-right-wall", "Ground")).toEqual(
      {
        type: "Ground",
      },
    );
    expect(scenario.world.getComponent("monitor-ceiling", "Ground")).toEqual({
      type: "Ground",
    });

    expect(
      scenario.world.getComponent("monitor-left-wall", "Transform"),
    ).toEqual({
      type: "Transform",
      position: { x: -24, y: 540 },
    });
    expect(
      scenario.world.getComponent("monitor-right-wall", "Transform"),
    ).toEqual({
      type: "Transform",
      position: { x: 1944, y: 540 },
    });
    expect(scenario.world.getComponent("monitor-ceiling", "Transform")).toEqual(
      {
        type: "Transform",
        position: { x: 960, y: -24 },
      },
    );
  });

  it("can model a dual-monitor virtual desktop with negative coordinates", () => {
    const scenario = createDemoScenario({ monitorLayout: "dual-horizontal" });
    const snapshot = scenario.world.snapshot();

    expect(snapshot.viewport).toEqual({
      x: -1280,
      y: 0,
      width: 3200,
      height: 1080,
    });
    expect(snapshot.monitors).toEqual([
      { id: "left", x: -1280, y: 0, width: 1280, height: 960 },
      { id: "primary", x: 0, y: 0, width: 1920, height: 1080 },
    ]);
    expect(scenario.world.getComponent("left-ground", "Transform")).toEqual({
      type: "Transform",
      position: { x: -640, y: 984 },
    });
    expect(
      scenario.world.getComponent("primary-left-wall-0", "Transform"),
    ).toEqual({
      type: "Transform",
      position: { x: -24, y: 1020 },
    });
    expect(scenario.world.getEntity("left-right-wall")).toBeUndefined();
  });

  it("does not pin the dual-monitor playground to a primary-monitor user anchor", () => {
    const scenario = createDemoScenario({ monitorLayout: "dual-horizontal" });

    expect(scenario.world.getEntity("user-anchor")).toBeUndefined();
  });

  it("lets a non-flying jump pet enter the left monitor in the dual-monitor playground", () => {
    const scenario = createDemoScenario({ monitorLayout: "dual-horizontal" });

    expect(scenario.world.getComponent("pet-b", "CanFly")).toBeUndefined();

    const crossing = runUntilPetReachesLeftMonitor(scenario, "pet-b", 600);

    expect(crossing).not.toBeNull();
    expect(crossing?.frame).toBeGreaterThanOrEqual(12);
    expect(crossing?.pet.action).toMatch(/^jump-|airborne$/);
    expect(crossing?.pet.position.x).toBeGreaterThan(-160);
  });

  it("lets a non-flying climb pet enter the left monitor after a high climb in the dual-monitor playground", () => {
    const scenario = createDemoScenario({ monitorLayout: "dual-horizontal" });

    expect(scenario.world.getComponent("pet-c", "CanFly")).toBeUndefined();

    // The seam between the monitors is open for y 0..960; the fixture scripts
    // pet-c to climb the seam wall to y=160 and dismount with a leftward
    // impulse strong enough to glide across. The world stays live during the
    // flight, so a passing pet can knock the glide off course — re-script the
    // climb and retry instead of depending on 20 seconds of emergent chaos
    // (the pre-cooldown behavior crossed by riding collision churn, which the
    // per-pair collision cooldown removed on purpose).
    let crossing = runUntilPetReachesLeftMonitor(scenario, "pet-c", 600);
    for (let attempt = 0; attempt < 3 && !crossing; attempt += 1) {
      scriptSeamClimb(scenario);
      crossing = runUntilPetReachesLeftMonitor(scenario, "pet-c", 600);
    }

    expect(crossing).not.toBeNull();
    expect(crossing?.pet.action).toBe("climb-dismounting");
    expect(crossing?.pet.position.x).toBeGreaterThan(-160);
    // Sanity: the glide lands near the seam side of the left monitor instead
    // of rocketing to its far wall.
    expect(runPetPath(scenario, "pet-c", 240).minX).toBeGreaterThan(-900);
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
    expect(alice.position.x).toBeGreaterThanOrEqual(100);
    expect(alice.position.x).toBeLessThanOrEqual(120);
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
        position: { x: 120, y: 1040 },
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
    expect(snapshot.pets[0].contact).toEqual({
      grounded: false,
      climbableSurfaceId: null,
    });
    expect(snapshot.pets[0].motionTarget).toBeNull();
  });

  it("exposes active pet expressions in the snapshot", () => {
    const scenario = createDemoScenario();

    scenario.world.setComponent("pet-a", {
      type: "PetExpressionState",
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 100,
      expiresAt: 700,
    });

    const pet = scenario.world
      .snapshot()
      .pets.find((entry) => entry.id === "pet-a");

    expect(pet?.expression).toEqual({
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 100,
      expiresAt: 700,
    });
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

  it("parks waiting pets without needing pet assets", () => {
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
      intent: "idle",
    });
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-a"),
    ).toMatchObject({
      animationState: "waiting",
    });
    expect(
      scenario.world.snapshot().pets.find((pet) => pet.id === "pet-a")
        ?.agentTask,
    ).toEqual({
      status: "waiting",
      label: "WAIT",
      summary: "Approve command",
    });
  });

  it("stops walking pets while waiting for user input", () => {
    const scenario = createDemoScenario({
      userAnchor: { x: 240, y: 500 },
    });

    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
    }
    scenario.world.setComponent("pet-a", {
      type: "IntentState",
      intent: "active",
    });
    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 120, y: 500 },
    });
    scenario.world.step(16);

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });

    const before = scenario.world
      .snapshot()
      .pets.find((pet) => pet.id === "pet-a")?.position;

    for (let index = 0; index < 45; index += 1) {
      scenario.world.step(16);
    }

    const after = scenario.world
      .snapshot()
      .pets.find((pet) => pet.id === "pet-a")?.position;
    expect(scenario.world.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(scenario.world.getComponent("pet-a", "ContactState")?.grounded).toBe(
      true,
    );
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-a"),
    ).toMatchObject({
      vx: expect.closeTo(0, 0),
      animationState: "waiting",
    });
  });

  it("keeps waiting pets parked when a collision happens during the hook state", () => {
    const scenario = createDemoScenario();
    const alicePosition = scenario.world.getComponent(
      "pet-a",
      "Transform",
    )?.position;
    expect(alicePosition).toBeDefined();
    scenario.world.setComponent("pet-b", {
      type: "Transform",
      position: { ...alicePosition! },
    });

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });
    scenario.world.step(16);
    scenario.world.step(16);

    expect(
      scenario.world.getComponent("pet-a", "BehaviorDecisionState"),
    ).toMatchObject({
      source: "agent-event",
      reason: "task.waiting",
    });
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-a"),
    ).toMatchObject({
      vx: expect.closeTo(0, 0),
      vy: expect.closeTo(0, 0),
      animationState: "waiting",
    });
  });

  it("holds waiting pets until the user interacts with that pet", () => {
    const scenario = createDemoScenario();

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });
    scenario.world.step(16);
    scenario.clock.advanceBy(6_000);
    scenario.world.step(16);

    expect(
      scenario.world.getComponent("pet-a", "AgentTaskState"),
    ).toMatchObject({
      status: "waiting",
    });
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-a"),
    ).toMatchObject({
      animationState: "waiting",
    });

    scenario.world.pushEvent({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: scenario.clock.now(),
      position: { x: 600, y: 1040 },
    });
    scenario.world.step(16);

    // Interaction lifts the hold but the agent's "waiting" report stays on
    // the pet.
    expect(
      scenario.world.getComponent("pet-a", "TaskMovementHold"),
    ).toBeUndefined();
    expect(
      scenario.world.getComponent("pet-a", "AgentTaskState"),
    ).toMatchObject({ status: "waiting" });
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
    expect(
      scenario.world.getComponent("pet-a", "TaskMovementHold"),
    ).toBeDefined();
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

    // Working is a moving status: task state is recorded, no hold applied.
    expect(
      scenario.world.getComponent("pet-a", "AgentTaskState"),
    ).toMatchObject({ status: "working" });
    expect(
      scenario.world.getComponent("pet-a", "TaskMovementHold"),
    ).toBeUndefined();

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 20,
      summary: "Done",
    });
    scenario.world.step(16);

    expect(
      scenario.world.getComponent("pet-a", "AgentTaskState"),
    ).toMatchObject({ status: "completed" });
    expect(
      scenario.world.getComponent("pet-a", "TaskMovementHold"),
    ).toBeDefined();
    expect(scenario.world.getComponent("pet-a", "SpeechState")).toMatchObject({
      type: "SpeechState",
      speech: "Done",
      expiresAt: 1_500,
    });
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
  });

  it("clears movement and shows failed state for failed task lifecycle", () => {
    const scenario = createDemoScenario();
    scenario.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 820, y: 500 },
    });

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.failed",
      sourceId: "agent-a",
      at: 20,
      summary: "Failed",
    });
    scenario.world.step(16);

    expect(scenario.world.getComponent("pet-a", "IntentState")).toEqual({
      type: "IntentState",
      intent: "idle",
    });
    expect(scenario.world.getComponent("pet-a", "MotionTarget")).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-a"),
    ).toMatchObject({
      animationState: "failed",
    });
  });

  it("clears speech after the speech bubble expires", () => {
    const scenario = createDemoScenario();

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 20,
      summary: "Done",
    });
    scenario.world.step(16);

    expect(scenario.world.getComponent("pet-a", "SpeechState")?.speech).toBe(
      "Done",
    );

    scenario.clock.advanceBy(1_501);
    scenario.world.step(16);

    expect(scenario.world.getComponent("pet-a", "SpeechState")).toMatchObject({
      type: "SpeechState",
      speech: null,
      expiresAt: null,
    });
  });

  it("stops flying pets while waiting for user input", () => {
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
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(
      scenario.world.snapshot().bodies.find((body) => body.id === "pet-e"),
    ).toMatchObject({
      vx: expect.closeTo(0, 0),
      vy: expect.closeTo(0, 0),
      animationState: "waiting",
    });
  });

  it("keeps flying waiting pets parked instead of targeting the user anchor", () => {
    const userAnchor = { x: 420, y: 500 };
    const scenario = createDemoScenario({ userAnchor });

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-e",
      at: 1,
      summary: "Needs approval",
    });

    scenario.world.step(16);
    scenario.world.step(16);

    expect(scenario.world.getComponent("pet-e", "IntentState")).toEqual({
      type: "IntentState",
      intent: "idle",
    });
    const motionAfterArrival = scenario.world.getComponent(
      "pet-e",
      "MotionTarget",
    );
    expect(motionAfterArrival?.targetEntityId).toBeNull();
    expect(motionAfterArrival?.targetPosition).toBeNull();
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

    // ArrivalBehaviorSystem detects that Alice is already at (600, 500),
    // clears the target and grants a personality-length rest beat (arrival
    // dwell). Once the dwell — and possibly a chosen rest — runs out,
    // BehaviorDecisionSystem commits a new goal. Step with the clock advancing
    // until that happens; the completed wander position must never come back.
    let hasNewTarget = false;
    for (let index = 0; index < 1_000 && !hasNewTarget; index += 1) {
      scenario.clock.advanceBy(16);
      scenario.world.step(16);
      const motion = scenario.world.getComponent("pet-a", "MotionTarget");
      // Must not have kept the completed wander position unchanged.
      expect(motion?.targetPosition).not.toEqual({ x: 600, y: 500 });
      hasNewTarget =
        motion?.targetEntityId !== null || motion?.targetPosition !== null;
    }
    expect(hasNewTarget).toBe(true);
  });

  it("jumps higher than the pet body height", () => {
    const scenario = createDemoScenario();

    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
    }

    const takeoffSnapshot = scenario.world.snapshot();
    const takeoffPet = takeoffSnapshot.pets.find((pet) => pet.id === "pet-a");
    const takeoffBody = takeoffSnapshot.bodies.find(
      (body) => body.id === "pet-a",
    );
    expect(scenario.world.getComponent("pet-a", "ContactState")?.grounded).toBe(
      true,
    );
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
      const pet = scenario.world
        .snapshot()
        .pets.find((entry) => entry.id === "pet-a");
      if (pet) minY = Math.min(minY, pet.position.y);
    }

    expect(takeoffPet!.position.y - minY).toBeGreaterThan(takeoffBody!.height);
  });
});

describe("jump playground scenario", () => {
  it("creates multiple walking pets that are ready to jump with visible horizontal impulse ranges", () => {
    const scenario = createJumpPlaygroundScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets.map((pet) => pet.id)).toEqual([
      "pet-a",
      "pet-b",
      "pet-c",
      "pet-d",
      "pet-e",
      "pet-f",
      "pet-g",
    ]);

    for (const pet of snapshot.pets) {
      expect(scenario.world.getComponent(pet.id, "WalkingTag")).toEqual({
        type: "WalkingTag",
      });
      expect(scenario.world.getComponent(pet.id, "FlyingTag")).toBeUndefined();
      expect(scenario.world.getComponent(pet.id, "JumpActionState")).toEqual({
        type: "JumpActionState",
        phase: "requested",
        cooldownMs: 0,
      });
      expect(
        scenario.world.getComponent(pet.id, "MotionTarget")?.targetPosition,
      ).not.toBeNull();
      expect(
        scenario.world.getComponent(pet.id, "CanJump")?.forwardImpulse?.min,
      ).toBeGreaterThan(0);
    }
  });

  it("adds raised floor walls as landing targets for jump inspection", () => {
    const scenario = createJumpPlaygroundScenario();
    const snapshot = scenario.world.snapshot();
    const wallBodies = snapshot.bodies.filter((body) =>
      body.id.startsWith("jump-wall-"),
    );

    expect(wallBodies).toHaveLength(1);
    for (const wall of wallBodies) {
      expect(wall.isStatic).toBe(true);
      expect(scenario.world.getComponent(wall.id, "Ground")).toEqual({
        type: "Ground",
      });
      expect(wall.height).toBeGreaterThan(48);
    }
  });

  it("keeps each jump pet in a local horizontal lane for visual comparison", () => {
    const scenario = createJumpPlaygroundScenario();

    for (const pet of scenario.world.snapshot().pets) {
      const target = scenario.world.getComponent(
        pet.id,
        "MotionTarget",
      )?.targetPosition;
      expect(target).not.toBeNull();
      expect(Math.abs(target!.x - pet.position.x)).toBeLessThanOrEqual(
        pet.id === "pet-a" ? 160 : 80,
      );
      if (pet.id === "pet-a") {
        expect(target!.y).toBeLessThan(pet.position.y);
      }
    }
  });

  it("uses larger pet bodies and stronger jump impulse for visual inspection", () => {
    const scenario = createJumpPlaygroundScenario();

    for (const pet of scenario.world.snapshot().pets) {
      expect(scenario.world.getComponent(pet.id, "PhysicsBody")).toEqual({
        type: "PhysicsBody",
        shape: "rectangle",
        width: 96,
        height: 114,
      });
      expect(
        scenario.world.getComponent(pet.id, "CanJump")?.impulse,
      ).toBeGreaterThan(DEFAULT_PET_JUMP_IMPULSE);
    }
  });

  it("lifts enlarged jump playground pets visibly off the ground", () => {
    const scenario = createJumpPlaygroundScenario({ startJumping: false });

    for (let index = 0; index < 30; index += 1) {
      scenario.world.step(16);
    }

    const startPet = scenario.world
      .snapshot()
      .pets.find((pet) => pet.id === "pet-a");
    const startBody = scenario.world
      .snapshot()
      .bodies.find((body) => body.id === "pet-a");
    expect(startPet).toBeDefined();
    expect(startBody).toBeDefined();
    expect(scenario.world.getComponent("pet-a", "ContactState")?.grounded).toBe(
      true,
    );

    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });

    let minY = startPet!.position.y;
    for (let index = 0; index < 90; index += 1) {
      scenario.world.step(16);
      const pet = scenario.world
        .snapshot()
        .pets.find((entry) => entry.id === "pet-a");
      if (pet) minY = Math.min(minY, pet.position.y);
    }

    expect(startPet!.position.y - minY).toBeGreaterThan(
      startBody!.height * 0.75,
    );
  });

  it("lets a jump playground pet land on top of a raised floor wall", () => {
    const scenario = createJumpPlaygroundScenario({ startJumping: false });
    const wall = scenario.world
      .snapshot()
      .bodies.find((body) => body.id === "jump-wall-a");

    expect(wall).toBeDefined();

    for (let index = 0; index < 30; index += 1) {
      scenario.world.step(16);
    }

    const target = scenario.world.getComponent(
      "pet-a",
      "MotionTarget",
    )?.targetPosition;
    expect(target).toBeDefined();

    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });

    let landedOnWall = false;
    for (let index = 0; index < 180; index += 1) {
      scenario.world.step(16);
      const pet = scenario.world
        .snapshot()
        .pets.find((entry) => entry.id === "pet-a");
      if (
        pet?.contact.grounded &&
        Math.abs(pet.position.x - target!.x) <= 24 &&
        Math.abs(pet.position.y - target!.y) <= 12
      ) {
        landedOnWall = true;
        break;
      }
    }

    expect(landedOnWall).toBe(true);
  });
});

describe("adopted pets scenario", () => {
  const pets = [
    {
      id: "pet-uuid-1",
      name: "Otto",
      sourceId: "agent-1",
      personality: reservedPersonality,
    },
    { id: "pet-uuid-2", name: "Mochi", sourceId: "agent-2" },
  ];

  it("creates one grounded walker per adopted pet keyed by its real id", () => {
    const scenario = createAdoptedPetsScenario(pets);
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets.map((pet) => pet.id)).toEqual([
      "pet-uuid-1",
      "pet-uuid-2",
    ]);
    expect(snapshot.pets.map((pet) => pet.name)).toEqual(["Otto", "Mochi"]);
    expect(snapshot.pets.map((pet) => pet.sourceId)).toEqual([
      "agent-1",
      "agent-2",
    ]);

    for (const pet of pets) {
      expect(scenario.world.getComponent(pet.id, "WalkingTag")).toEqual({
        type: "WalkingTag",
      });
      expect(scenario.world.getComponent(pet.id, "CanWalk")).toEqual({
        type: "CanWalk",
        force: DEFAULT_PET_WALK_FORCE,
      });
      expect(scenario.world.getComponent(pet.id, "WandersOnArrival")).toEqual({
        type: "WandersOnArrival",
        arrivalRadius: 16,
      });
      expect(scenario.world.getComponent(pet.id, "CanDrag")).toEqual({
        type: "CanDrag",
      });
    }
  });

  it("derives movement from the supplied personality", () => {
    const scenario = createAdoptedPetsScenario(pets);

    expect(scenario.world.getComponent("pet-uuid-1", "Personality")).toEqual(
      reservedPersonality,
    );
    expect(
      scenario.world.getComponent("pet-uuid-1", "MovementProfile"),
    ).toEqual(deriveMovementProfile(reservedPersonality));
  });

  it("sizes pet bodies for desktop projection", () => {
    const scenario = createAdoptedPetsScenario(pets, {
      petBodySize: { width: 78, height: 82 },
    });

    expect(scenario.world.getComponent("pet-uuid-1", "PhysicsBody")).toEqual({
      type: "PhysicsBody",
      shape: "rectangle",
      width: 78,
      height: 82,
    });
  });

  it("places adopted pet bodies on top of the monitor floor", () => {
    const scenario = createAdoptedPetsScenario(pets, {
      petBodySize: { width: 78, height: 120 },
      monitors: [{ id: "primary", x: 0, y: 0, width: 960, height: 540 }],
    });

    const body = scenario.world
      .snapshot()
      .bodies.find((entry) => entry.id === "pet-uuid-1");

    expect(body).toBeDefined();
    expect(body!.y + body!.height / 2).toBe(540);
  });

  it("uses desktop monitor work areas when creating adopted pet grounds", () => {
    const scenario = createAdoptedPetsScenario(pets, {
      monitors: [
        { id: "left", x: -640, y: 0, width: 640, height: 480 },
        { id: "primary", x: 0, y: 0, width: 960, height: 540 },
      ],
    });

    expect(scenario.world.snapshot().viewport).toEqual({
      x: -640,
      y: 0,
      width: 1600,
      height: 540,
    });
    expect(scenario.world.snapshot().monitors).toEqual([
      { id: "left", x: -640, y: 0, width: 640, height: 480 },
      { id: "primary", x: 0, y: 0, width: 960, height: 540 },
    ]);
    expect(scenario.world.snapshot().bodies).toContainEqual(
      expect.objectContaining({
        id: "left-ground",
        isStatic: true,
        x: -320,
        y: 504,
        width: 640,
        height: 48,
      }),
    );
    expect(scenario.world.snapshot().bodies).toContainEqual(
      expect.objectContaining({
        id: "primary-ground",
        isStatic: true,
        x: 480,
        y: 564,
        width: 960,
        height: 48,
      }),
    );
  });

  it("starts adopted pets inside the monitor work area they occupy", () => {
    const monitors = [
      { id: "left", x: -640, y: 0, width: 640, height: 480 },
      { id: "primary", x: 0, y: 0, width: 960, height: 540 },
    ];
    const scenario = createAdoptedPetsScenario(pets, { monitors });

    for (const pet of scenario.world.snapshot().pets) {
      const monitor = monitors.find(
        (candidate) =>
          pet.position.x >= candidate.x &&
          pet.position.x <= candidate.x + candidate.width,
      );

      expect(
        monitor,
        `${pet.id} is horizontally inside a monitor`,
      ).toBeDefined();
      expect(pet.position.y).toBeGreaterThanOrEqual(monitor!.y);
      expect(pet.position.y).toBeLessThanOrEqual(monitor!.y + monitor!.height);
    }
  });

  it("starts adopted pets at the supplied spawn point before they fall", () => {
    const scenario = createAdoptedPetsScenario(pets, {
      monitors: [{ id: "primary", x: 0, y: 0, width: 960, height: 540 }],
      spawnPoint: { x: 480, y: 180 },
    });

    for (const pet of scenario.world.snapshot().pets) {
      expect(pet.position).toEqual({ x: 480, y: 180 });
    }
  });

  it("starts the first adopted pet on the monitor containing the desktop origin", () => {
    const scenario = createAdoptedPetsScenario(pets, {
      monitors: [
        { id: "left", x: -640, y: 0, width: 640, height: 480 },
        { id: "primary", x: 0, y: 0, width: 960, height: 540 },
      ],
    });

    const firstPet = scenario.world
      .snapshot()
      .pets.find((pet) => pet.id === "pet-uuid-1");

    expect(firstPet?.position.x).toBeGreaterThanOrEqual(0);
    expect(firstPet?.position.x).toBeLessThanOrEqual(960);
    expect(firstPet?.position.y).toBeGreaterThanOrEqual(0);
    expect(firstPet?.position.y).toBeLessThanOrEqual(540);
  });

  it("keeps simulated adopted pets on screen across many frames", () => {
    const scenario = createAdoptedPetsScenario(pets);

    for (let frame = 0; frame < 120; frame += 1) {
      scenario.world.step(16);
    }

    const snapshot = scenario.world.snapshot();
    for (const body of snapshot.bodies.filter((entry) =>
      entry.id.startsWith("pet-uuid-"),
    )) {
      expect(body.x).toBeGreaterThanOrEqual(0);
      expect(body.x).toBeLessThanOrEqual(snapshot.width);
      expect(body.y).toBeLessThanOrEqual(snapshot.height);
    }
  });

  it("syncs PetCollision when a dragged adopted pet overlaps another adopted pet", () => {
    const scenario = createAdoptedPetsScenario(pets, {
      petBodySize: { width: 80, height: 100 },
      monitors: [{ id: "primary", x: 0, y: 0, width: 960, height: 540 }],
    });
    const target = scenario.world.getComponent("pet-uuid-2", "Transform");

    expect(target).toBeDefined();

    scenario.world.setComponent("user-interaction", {
      type: "DragInteraction",
      pointerId: 1,
      entityId: "pet-uuid-1",
      phase: "dragging",
      grabOffset: { x: 0, y: 0 },
      pointerPosition: { ...target!.position },
      startedAt: 0,
      samples: [],
    });

    scenario.world.step(16);
    scenario.world.step(16);

    expect(
      scenario.world.getComponent("pet-uuid-1", "PetCollision"),
    ).toMatchObject({
      otherEntityId: "pet-uuid-2",
    });
    expect(
      scenario.world.getComponent("pet-uuid-2", "PetCollision"),
    ).toMatchObject({
      otherEntityId: "pet-uuid-1",
    });
  });
});

describe("climb playground scenario", () => {
  it("creates multiple pets attached to separate climbable surfaces", () => {
    const scenario = createClimbPlaygroundScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.pets.map((pet) => pet.id)).toEqual([
      "pet-a",
      "pet-b",
      "pet-c",
      "pet-d",
      "pet-e",
    ]);
    expect(snapshot.climbableSurfaces).toHaveLength(5);

    for (const pet of snapshot.pets) {
      expect(scenario.world.getComponent(pet.id, "ClimbingTag")).toEqual({
        type: "ClimbingTag",
      });
      expect(
        scenario.world.getComponent(pet.id, "CanWallClimb")?.velocity,
      ).toBeGreaterThan(0);
      expect(
        scenario.world.getComponent(pet.id, "CanWallClimb")?.dismountImpulse
          ?.min,
      ).toBeGreaterThan(0);
      expect(
        scenario.world.getComponent(pet.id, "ClimbIntentState")?.phase,
      ).toBe("attached");
      expect(
        scenario.world.getComponent(pet.id, "MotionTarget")?.targetPosition?.y,
      ).toBeLessThan(pet.position.y);
    }
  });
});
