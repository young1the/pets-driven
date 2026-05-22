import { describe, expect, it } from "vitest";
import type { PetIntent, Vector } from "@/core/components/simulation-components";
import { DEFAULT_PET_SPEECH } from "@/core/constants/pet-speech";
import { runArrivalBehaviorSystem } from "@/core/systems/arrival-behavior-system";
import { runClimbAttachmentSystem } from "@/core/systems/climb-attachment-system";
import { runClimbDismountSystem } from "@/core/systems/climb-dismount-system";
import { runCollisionReactionSystem } from "@/core/systems/collision-reaction-system";
import { runContactSystem } from "@/core/systems/contact-system";
import { runPhysicsIntegrationSystem } from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runFlightSystem } from "@/core/systems/flight-system";
import { runJumpSystem } from "@/core/systems/jump-system";
import { runLocomotionActiveStateSystem } from "@/core/systems/locomotion-active-state-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { runWalkSystem } from "@/core/systems/walk-system";
import { runWallClimbSystem } from "@/core/systems/wall-climb-system";
import { createManualClock } from "@/shared/time/manual-clock";

function createCollisionPet(id: string, intent: PetIntent, position: Vector) {
  return {
    id,
    transform: {
      type: "Transform" as const,
      position,
    },
    body: {
      type: "PhysicsBody" as const,
      shape: "rectangle" as const,
      width: 32,
      height: 38,
    },
    intent: {
      type: "IntentState" as const,
      intent,
    },
    motion: {
      type: "MotionTarget" as const,
      targetEntityId: null as string | null,
      targetPosition: { x: 400, y: 100 } as Vector | null,
    },
  };
}

describe("behavior systems", () => {
  it("creates a speech bubble after a talkative pet idles long enough", () => {
    const clock = createManualClock(0);
    const pet = {
      id: "pet-a",
      idleConversation: {
        type: "IdleConversation" as const,
        idleAfterMs: 5_000,
      },
      speechProfile: {
        type: "SpeechProfile" as const,
        idleCompanion: "Custom idle line",
        attentionNeeded: DEFAULT_PET_SPEECH.attentionNeeded,
        taskStarted: DEFAULT_PET_SPEECH.taskStarted,
        taskCompleted: DEFAULT_PET_SPEECH.taskCompleted,
      },
      activity: { type: "ActivityState" as const, lastActiveAt: 0 },
      speech: { type: "SpeechState" as const, speech: null as string | null },
    };

    clock.advanceBy(5_000);
    runIdleConversationSystem([pet], clock);

    expect(pet.speech.speech).toBe("Custom idle line");
  });

  it("turns waiting stimuli into an attention-seeking intent", () => {
    const pet = {
      id: "pet-a",
      agent: { type: "AgentBinding" as const, sourceId: "agent-a" },
      intent: { type: "IntentState" as const, intent: "idle" as const },
      speech: { type: "SpeechState" as const, speech: null as string | null },
      speechProfile: {
        type: "SpeechProfile" as const,
        idleCompanion: DEFAULT_PET_SPEECH.idleCompanion,
        attentionNeeded: "Custom attention line",
        taskStarted: DEFAULT_PET_SPEECH.taskStarted,
        taskCompleted: DEFAULT_PET_SPEECH.taskCompleted,
      },
      activity: { type: "ActivityState" as const, lastActiveAt: 0 },
      completionBehavior: {
        type: "CompletionBehavior" as const,
        intentAfterCompletion: "idle" as const,
      },
    };

    runStimulusReactionSystem(
      [pet],
      [{ type: "task.waiting", sourceId: "agent-a", at: 10 }],
    );

    expect(pet.intent.intent).toBe("seek");
    expect(pet.speech.speech).toBe("Custom attention line");
  });

  it("turns started stimuli into active pets", () => {
    const pet = {
      id: "pet-a",
      agent: { type: "AgentBinding" as const, sourceId: "agent-a" },
      intent: { type: "IntentState" as const, intent: "idle" as const },
      speechProfile: {
        type: "SpeechProfile" as const,
        idleCompanion: DEFAULT_PET_SPEECH.idleCompanion,
        attentionNeeded: DEFAULT_PET_SPEECH.attentionNeeded,
        taskStarted: "Custom working line",
        taskCompleted: DEFAULT_PET_SPEECH.taskCompleted,
      },
      speech: {
        type: "SpeechState" as const,
        speech: "Old message" as string | null,
      },
      activity: {
        type: "ActivityState" as const,
        lastActiveAt: 0,
      },
      completionBehavior: {
        type: "CompletionBehavior" as const,
        intentAfterCompletion: "idle" as const,
      },
    };

    runStimulusReactionSystem(
      [pet],
      [{ type: "task.started", sourceId: "agent-a", at: 10 }],
    );

    expect(pet.intent.intent).toBe("active");
    expect(pet.speech.speech).toBe("Custom working line");
    expect(pet.activity.lastActiveAt).toBe(10);
  });

  it("turns completed stimuli into the configured completion intent with speech", () => {
    const pet = {
      id: "pet-a",
      agent: { type: "AgentBinding" as const, sourceId: "agent-a" },
      intent: { type: "IntentState" as const, intent: "active" as const },
      speechProfile: {
        type: "SpeechProfile" as const,
        idleCompanion: DEFAULT_PET_SPEECH.idleCompanion,
        attentionNeeded: DEFAULT_PET_SPEECH.attentionNeeded,
        taskStarted: DEFAULT_PET_SPEECH.taskStarted,
        taskCompleted: "Custom completed line",
      },
      speech: {
        type: "SpeechState" as const,
        speech: null as string | null,
      },
      activity: {
        type: "ActivityState" as const,
        lastActiveAt: 0,
      },
      completionBehavior: {
        type: "CompletionBehavior" as const,
        intentAfterCompletion: "seek" as const,
      },
    };

    runStimulusReactionSystem(
      [pet],
      [{ type: "task.completed", sourceId: "agent-a", at: 20 }],
    );

    expect(pet.intent.intent).toBe("seek");
    expect(pet.speech.speech).toBe("Custom completed line");
    expect(pet.activity.lastActiveAt).toBe(20);
  });

  it("clears a world target after a wandering pet arrives", () => {
    const pet = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      locomotion: { type: "LocomotionState" as const, baseMode: "walk" as const },
      transform: {
        type: "Transform" as const,
        position: { x: 100, y: 100 },
      },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null as string | null,
        targetPosition: { x: 108, y: 100 } as { x: number; y: number } | null,
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };

    runArrivalBehaviorSystem([pet], []);

    expect(pet.motion).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
  });

  it("keeps entity target when no matching anchor is present", () => {
    const pet = {
      intent: { type: "IntentState" as const, intent: "seek" as const },
      locomotion: { type: "LocomotionState" as const, baseMode: "walk" as const },
      transform: {
        type: "Transform" as const,
        position: { x: 100, y: 100 },
      },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: "user-anchor" as string | null,
        targetPosition: null as { x: number; y: number } | null,
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };

    runArrivalBehaviorSystem([pet], []);

    expect(pet.motion.targetEntityId).toBe("user-anchor");
    expect(pet.intent.intent).toBe("seek");
  });

  it("moves idle collision targets away from the collided pet", () => {
    const pet = createCollisionPet("pet-a", "idle", { x: 200, y: 100 });

    runCollisionReactionSystem(
      [pet, createCollisionPet("pet-b", "idle", { x: 220, y: 100 })],
      { width: 960, height: 540 },
    );

    expect(pet.motion).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 104, y: 100 },
    });
  });

  it("moves active collision targets diagonally around the collided pet", () => {
    const pet = createCollisionPet("pet-a", "active", { x: 200, y: 100 });

    runCollisionReactionSystem(
      [pet, createCollisionPet("pet-b", "idle", { x: 220, y: 100 })],
      { width: 960, height: 540 },
    );

    expect(pet.motion.targetEntityId).toBeNull();
    expect(pet.motion.targetPosition?.x).toBeCloseTo(132.118);
    expect(pet.motion.targetPosition?.y).toBeCloseTo(48);
  });

  it("moves seeking collision targets around the collided pet while preserving progress", () => {
    const pet = createCollisionPet("pet-a", "seek", { x: 200, y: 100 });
    pet.motion.targetEntityId = "user-anchor";
    pet.motion.targetPosition = { x: 500, y: 100 };

    runCollisionReactionSystem(
      [pet, createCollisionPet("pet-b", "idle", { x: 220, y: 100 })],
      { width: 960, height: 540 },
    );

    expect(pet.motion.targetEntityId).toBeNull();
    expect(pet.motion.targetPosition?.x).toBeCloseTo(267.882);
    expect(pet.motion.targetPosition?.y).toBeCloseTo(48);
  });

  it("records the nearest climbable surface contact", () => {
    const nearContact = {
      type: "ContactState" as const,
      grounded: false,
      climbableSurfaceId: null as string | null,
      climbableSurfacePosition: null as { x: number; y: number } | null,
    };
    const farContact = {
      type: "ContactState" as const,
      grounded: false,
      climbableSurfaceId: "old-surface" as string | null,
      climbableSurfacePosition: { x: 0, y: 0 } as { x: number; y: number } | null,
    };

    runContactSystem(
      [
        {
          id: "pet-a",
          position: { x: 100, y: 120 },
          body: {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          contact: nearContact,
        },
        {
          id: "pet-b",
          position: { x: 400, y: 120 },
          body: {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          contact: farContact,
        },
      ],
      [
        {
          id: "climb-wall",
          position: { x: 124, y: 120 },
        },
      ],
      [],
    );

    expect(nearContact.climbableSurfaceId).toBe("climb-wall");
    expect(nearContact.climbableSurfacePosition).toEqual({ x: 124, y: 120 });
    expect(farContact.climbableSurfaceId).toBeNull();
    expect(farContact.climbableSurfacePosition).toBeNull();
  });

  it("keeps climbable contact within a vertical climb space", () => {
    const contact = {
      type: "ContactState" as const,
      grounded: false,
      climbableSurfaceId: null as string | null,
      climbableSurfacePosition: null as { x: number; y: number } | null,
    };

    runContactSystem(
      [
        {
          id: "pet-a",
          position: { x: 124, y: 360 },
          body: {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          contact,
        },
      ],
      [
        {
          id: "climb-wall",
          position: { x: 120, y: 500 },
        },
      ],
      [],
    );

    expect(contact.climbableSurfaceId).toBe("climb-wall");
    expect(contact.climbableSurfacePosition).toEqual({ x: 120, y: 500 });
  });

  it("marks pets as grounded when their body rests on a ground surface", () => {
    const contact = {
      type: "ContactState" as const,
      grounded: false,
      climbableSurfaceId: null as string | null,
      climbableSurfacePosition: null as Vector | null,
    };

    runContactSystem(
      [
        {
          id: "pet-a",
          position: { x: 200, y: 521 },
          body: {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 32,
            height: 38,
          },
          contact,
        },
      ],
      [],
      [
        {
          id: "monitor-ground",
          position: { x: 480, y: 564 },
          size: { width: 960, height: 48 },
        },
      ],
    );

    expect(contact.grounded).toBe(true);
  });

  it("merges steering forces by entity before stepping physics", () => {
    const appliedForces: Array<{
      id: string;
      force: { x: number; y: number };
    }> = [];
    const physics = {
      applyForce(id: string, force: { x: number; y: number }) {
        appliedForces.push({ id, force });
      },
      step() {},
    };

    runPhysicsIntegrationSystem({
      physics,
      deltaMs: 16,
      forceGroups: [
        [{ id: "pet-a", x: 1, y: 2 }],
        [{ id: "pet-a", x: 0.5, y: -1 }],
      ],
    });

    expect(appliedForces).toEqual([{ id: "pet-a", force: { x: 1.5, y: 1 } }]);
  });

  it("syncs transform components from physics body snapshots", () => {
    const transform = {
      type: "Transform" as const,
      position: { x: 0, y: 0 },
    };
    const physics = {
      snapshot() {
        return {
          bodies: [
            {
              id: "pet-a",
              x: 42,
              y: 24,
              vx: 0,
              vy: 0,
              shape: "rectangle" as const,
              width: 32,
              height: 38,
            },
          ],
        };
      },
    };

    const snapshot = runPhysicsTransformSyncSystem(
      [{ id: "pet-a", transform }],
      physics,
    );

    expect(transform.position).toEqual({ x: 42, y: 24 });
    expect(snapshot.bodies[0]?.id).toBe("pet-a");
  });

  it("applies flight gravity scale and hover force only when flight is active", () => {
    const gravityScales: Array<{ id: string; scale: number }> = [];
    const appliedForces: Array<{
      id: string;
      force: { x: number; y: number };
    }> = [];
    const physics = {
      setGravityScale(id: string, scale: number) {
        gravityScales.push({ id, scale });
      },
      applyForce(id: string, force: { x: number; y: number }) {
        appliedForces.push({ id, force });
      },
    };

    runFlightSystem(
      [
        {
          id: "pet-a",
          flying: { type: "FlyingState" as const },
          canFly: {
            type: "CanFly" as const,
            gravityScale: 0,
            hoverStrength: 0.003,
          },
        },
      ],
      physics,
    );

    expect(gravityScales).toEqual([{ id: "pet-a", scale: 0 }]);
    expect(appliedForces).toEqual([
      { id: "pet-a", force: { x: 0, y: -0.003 } },
    ]);
  });

  it("syncs active locomotion tags from the transitional locomotion state", () => {
    const writes: Array<{ id: string; component: { type: string } }> = [];
    const removals: Array<{ id: string; type: string }> = [];
    const components = {
      setComponent(id: string, component: { type: string }) {
        writes.push({ id, component });
      },
      removeComponent(id: string, type: string) {
        removals.push({ id, type });
      },
    };

    runLocomotionActiveStateSystem(
      [
        {
          id: "pet-a",
          locomotion: { type: "LocomotionState" as const, baseMode: "climb" },
          contact: {
            type: "ContactState" as const,
            grounded: false,
            climbableSurfaceId: "climb-wall",
            climbableSurfacePosition: { x: 120, y: 500 },
          },
        },
        {
          id: "pet-b",
          locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
          contact: {
            type: "ContactState" as const,
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
        },
      ],
      components,
    );

    expect(removals).toContainEqual({ id: "pet-a", type: "WalkingState" });
    expect(removals).toContainEqual({ id: "pet-a", type: "ClimbingState" });
    expect(removals).toContainEqual({ id: "pet-a", type: "FlyingState" });
    expect(writes).toContainEqual({
      id: "pet-a",
      component: { type: "ClimbingState" },
    });
    expect(writes).toContainEqual({
      id: "pet-b",
      component: { type: "WalkingState" },
    });
    expect(writes).toContainEqual({
      id: "pet-b",
      component: { type: "AirborneState" },
    });
  });

  it("locks horizontal position and velocity when a pet attaches to climb", () => {
    const velocityUpdates: Array<{
      id: string;
      velocity: { x?: number; y?: number };
    }> = [];
    const positionUpdates: Array<{
      id: string;
      position: { x?: number; y?: number };
    }> = [];
    const physics = {
      setVelocity(id: string, velocity: { x?: number; y?: number }) {
        velocityUpdates.push({ id, velocity });
      },
      setPosition(id: string, position: { x?: number; y?: number }) {
        positionUpdates.push({ id, position });
      },
    };
    const transform = {
      type: "Transform" as const,
      position: { x: 176, y: 500 },
    };

    runClimbAttachmentSystem(
      [
        {
          id: "pet-a",
          climbing: { type: "ClimbingState" as const },
          transform,
          contact: {
            type: "ContactState" as const,
            grounded: true,
            climbableSurfaceId: "climb-wall",
            climbableSurfacePosition: { x: 120, y: 500 },
          },
        },
      ],
      physics,
    );

    expect(velocityUpdates).toEqual([
      { id: "pet-a", velocity: { x: 0 } },
    ]);
    expect(positionUpdates).toEqual([
      { id: "pet-a", position: { x: 120 } },
    ]);
    expect(transform.position.x).toBe(120);
  });

  it("creates horizontal walking force only when walking is active", () => {
    const forces = runWalkSystem([
      {
        id: "pet-a",
        position: { x: 0, y: 10 },
        walking: { type: "WalkingState" as const },
        contact: {
          type: "ContactState" as const,
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        canWalk: { type: "CanWalk" as const, speed: 0.004 },
        motion: {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 100, y: 200 },
        },
        navigation: {
          type: "NavigationState" as const,
          avoidanceWaypoint: null,
        },
      },
    ]);

    expect(forces).toEqual([{ id: "pet-a", x: 0.004, y: 0 }]);
  });

  it("does not create walking force while a walking pet is airborne", () => {
    const forces = runWalkSystem([
      {
        id: "pet-a",
        position: { x: 0, y: 10 },
        walking: { type: "WalkingState" as const },
        contact: {
          type: "ContactState" as const,
          grounded: false,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        canWalk: { type: "CanWalk" as const, speed: 0.004 },
        motion: {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 100, y: 200 },
        },
        navigation: {
          type: "NavigationState" as const,
          avoidanceWaypoint: null,
        },
      },
    ]);

    expect(forces).toEqual([]);
  });

  it("creates upward jump force when jump is requested by a grounded walking pet", () => {
    const jumpAction = {
      type: "JumpActionState" as const,
      phase: "requested" as const,
      cooldownMs: 0,
    };
    const forces = runJumpSystem([
      {
        id: "pet-a",
        locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
        contact: {
          type: "ContactState" as const,
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        jump: { type: "CanJump" as const, impulse: 0.012 },
        jumpAction,
      },
      {
        id: "pet-b",
        locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
        contact: {
          type: "ContactState" as const,
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        jump: { type: "CanJump" as const, impulse: 0.012 },
        jumpAction: {
          type: "JumpActionState" as const,
          phase: "ready" as const,
          cooldownMs: 0,
        },
      },
    ]);

    expect(forces).toEqual([{ id: "pet-a", x: 0, y: -0.012 }]);
    expect(jumpAction.phase).toBe("rising");
  });

  it("advances jump phases through airborne and landing cooldown", () => {
    const jumpAction = {
      type: "JumpActionState" as const,
      phase: "requested" as const,
      cooldownMs: 0,
    };
    const contact = {
      type: "ContactState" as const,
      grounded: true,
      climbableSurfaceId: null as string | null,
      climbableSurfacePosition: null as Vector | null,
    };
    const entity = {
      id: "pet-a",
      locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
      contact,
      jump: { type: "CanJump" as const, impulse: 0.012 },
      jumpAction,
    } as const;

    expect(runJumpSystem([entity])).toEqual([{ id: "pet-a", x: 0, y: -0.012 }]);
    expect(runJumpSystem([entity])).toEqual([]);
    expect(jumpAction.phase).toBe("rising");

    contact.grounded = false;
    expect(runJumpSystem([entity])).toEqual([]);
    expect(jumpAction.phase).toBe("falling");

    contact.grounded = true;
    expect(runJumpSystem([entity], 16)).toEqual([]);
    expect(jumpAction.phase).toBe("landingCooldown");
    expect(jumpAction.cooldownMs).toBe(250);

    expect(runJumpSystem([entity], 250)).toEqual([]);
    expect(jumpAction).toEqual({
      type: "JumpActionState",
      phase: "ready",
      cooldownMs: 0,
    });
  });

  it("creates vertical wall-climb force only when wall climbing is active", () => {
    const forces = runWallClimbSystem([
      {
        id: "pet-a",
        position: { x: 920, y: 420 },
        climbing: { type: "ClimbingState" as const },
        canWallClimb: { type: "CanWallClimb" as const, speed: 0.003 },
        contact: {
          type: "ContactState" as const,
          grounded: false,
          climbableSurfaceId: "climb-wall",
          climbableSurfacePosition: { x: 920, y: 420 },
        },
        motion: {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 920, y: 120 },
        },
      },
      {
        id: "pet-b",
        position: { x: 920, y: 420 },
        climbing: { type: "ClimbingState" as const },
        canWallClimb: { type: "CanWallClimb" as const, speed: 0.003 },
        contact: {
          type: "ContactState" as const,
          grounded: false,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        motion: {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 920, y: 120 },
        },
      },
    ]);

    expect(forces).toEqual([{ id: "pet-a", x: 0, y: -0.003 }]);
  });

  it("uses proportional surface grip while wall climbing", () => {
    const forces = runWallClimbSystem([
      {
        id: "pet-a",
        position: { x: 132, y: 420 },
        climbing: { type: "ClimbingState" as const },
        canWallClimb: { type: "CanWallClimb" as const, speed: 0.003 },
        contact: {
          type: "ContactState" as const,
          grounded: false,
          climbableSurfaceId: "climb-wall",
          climbableSurfacePosition: { x: 120, y: 420 },
        },
        motion: {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 400, y: 120 },
        },
      },
    ]);

    expect(forces).toHaveLength(1);
    expect(forces[0]?.id).toBe("pet-a");
    expect(forces[0]?.x).toBeCloseTo(-0.0024);
    expect(forces[0]?.y).toBeCloseTo(-0.003);
  });

  it("does not apply horizontal wall-climb grip inside the surface dead zone", () => {
    const forces = runWallClimbSystem([
      {
        id: "pet-a",
        position: { x: 121, y: 420 },
        climbing: { type: "ClimbingState" as const },
        canWallClimb: { type: "CanWallClimb" as const, speed: 0.003 },
        contact: {
          type: "ContactState" as const,
          grounded: false,
          climbableSurfaceId: "climb-wall",
          climbableSurfacePosition: { x: 120, y: 420 },
        },
        motion: {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 120, y: 120 },
        },
      },
    ]);

    expect(forces).toEqual([{ id: "pet-a", x: 0, y: -0.003 }]);
  });

  it("lets a walking, climbing, and jumping pet dismount after finishing a climb target", () => {
    const entity = {
      id: "pet-a",
      locomotion: { type: "LocomotionState" as const, baseMode: "climb" as const },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null as string | null,
        targetPosition: null as Vector | null,
      },
      contact: {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: "climb-wall" as string | null,
        climbableSurfacePosition: { x: 120, y: 500 } as Vector | null,
      },
      walk: { type: "CanWalk" as const, speed: 0.01 },
      wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
      jump: { type: "CanJump" as const, impulse: 0.014 },
      jumpAction: {
        type: "JumpActionState" as const,
        phase: "ready" as const,
        cooldownMs: 0,
      },
      climbDismount: {
        type: "ClimbDismountState" as const,
        phase: "ready" as const,
        cooldownMs: 0,
      },
    };

    runClimbDismountSystem([entity], 16);

    expect(entity.locomotion.baseMode).toBe("walk");
    expect(entity.jumpAction).toEqual({
      type: "JumpActionState",
      phase: "falling",
      cooldownMs: 0,
    });
    expect(entity.climbDismount.phase).toBe("airborne");
    expect(entity.climbDismount.cooldownMs).toBe(0);
  });

  it("keeps climbing when a climbing pet still has a target", () => {
    const entity = {
      id: "pet-a",
      locomotion: { type: "LocomotionState" as const, baseMode: "climb" as const },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null as string | null,
        targetPosition: { x: 120, y: 120 } as Vector | null,
      },
      contact: {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: "climb-wall" as string | null,
        climbableSurfacePosition: { x: 120, y: 500 } as Vector | null,
      },
      walk: { type: "CanWalk" as const, speed: 0.01 },
      wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
      jump: { type: "CanJump" as const, impulse: 0.014 },
      jumpAction: {
        type: "JumpActionState" as const,
        phase: "ready" as const,
        cooldownMs: 0,
      },
      climbDismount: {
        type: "ClimbDismountState" as const,
        phase: "ready" as const,
        cooldownMs: 0,
      },
    };

    runClimbDismountSystem([entity], 16);

    expect(entity.locomotion.baseMode).toBe("climb");
    expect(entity.jumpAction.phase).toBe("ready");
    expect(entity.climbDismount.phase).toBe("ready");
    expect(entity.climbDismount.cooldownMs).toBe(0);
  });

  it("starts climb dismount cooldown only after the pet lands", () => {
    const entity = {
      id: "pet-a",
      locomotion: { type: "LocomotionState" as const, baseMode: "walk" as const },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null as string | null,
        targetPosition: null as Vector | null,
      },
      contact: {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: "climb-wall" as string | null,
        climbableSurfacePosition: { x: 120, y: 500 } as Vector | null,
      },
      walk: { type: "CanWalk" as const, speed: 0.01 },
      wallClimb: { type: "CanWallClimb" as const, speed: 0.004 },
      jump: { type: "CanJump" as const, impulse: 0.014 },
      jumpAction: {
        type: "JumpActionState" as const,
        phase: "ready" as const,
        cooldownMs: 0,
      },
      climbDismount: {
        type: "ClimbDismountState" as const,
        phase: "airborne" as const,
        cooldownMs: 0,
      },
    };

    runClimbDismountSystem([entity], 300);

    expect(entity.climbDismount).toEqual({
      type: "ClimbDismountState",
      phase: "airborne",
      cooldownMs: 0,
    });

    entity.contact.grounded = true;
    runClimbDismountSystem([entity], 16);

    expect(entity.climbDismount).toEqual({
      type: "ClimbDismountState",
      phase: "coolingDown",
      cooldownMs: 700,
    });
  });
});
