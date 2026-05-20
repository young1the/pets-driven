import { describe, expect, it } from "vitest";
import { DEFAULT_PET_SPEECH } from "@/core/constants/pet-speech";
import { runArrivalBehaviorSystem } from "@/core/systems/arrival-behavior-system";
import { runContactSystem } from "@/core/systems/contact-system";
import { runCrowdAvoidanceSystem } from "@/core/systems/crowd-avoidance-system";
import { runPhysicsIntegrationSystem } from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runFlightSystem } from "@/core/systems/flight-system";
import { runJumpSystem } from "@/core/systems/jump-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { runWalkSystem } from "@/core/systems/walk-system";
import { runWallClimbSystem } from "@/core/systems/wall-climb-system";
import { createManualClock } from "@/shared/time/manual-clock";

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

  it("creates crowd avoidance force only for pets with avoidance personality", () => {
    const forces = runCrowdAvoidanceSystem(
      [
        {
          id: "pet-a",
          position: { x: 0, y: 0 },
          avoidsCrowds: {
            type: "AvoidsCrowds" as const,
            radius: 80,
            strength: 0.004,
          },
        },
        {
          id: "pet-b",
          position: { x: 120, y: 0 },
          avoidsCrowds: {
            type: "AvoidsCrowds" as const,
            radius: 80,
            strength: 0.004,
          },
        },
      ],
      [
        { id: "pet-a", position: { x: 0, y: 0 } },
        { id: "pet-c", position: { x: 40, y: 0 } },
      ],
    );

    expect(forces).toEqual([{ id: "pet-a", x: -0.002, y: 0 }]);
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
          contact: nearContact,
        },
        {
          id: "pet-b",
          position: { x: 400, y: 120 },
          contact: farContact,
        },
      ],
      [
        {
          id: "climb-wall",
          position: { x: 124, y: 120 },
        },
      ],
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
          contact,
        },
      ],
      [
        {
          id: "climb-wall",
          position: { x: 120, y: 500 },
        },
      ],
    );

    expect(contact.climbableSurfaceId).toBe("climb-wall");
    expect(contact.climbableSurfacePosition).toEqual({ x: 120, y: 500 });
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
          locomotion: { type: "LocomotionState" as const, baseMode: "fly" },
          flight: {
            type: "FlightMovement" as const,
            gravityScale: 0,
            hoverStrength: 0.003,
          },
        },
        {
          id: "pet-b",
          locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
          flight: {
            type: "FlightMovement" as const,
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

  it("creates horizontal walking force only when walking is active", () => {
    const forces = runWalkSystem([
      {
        id: "pet-a",
        position: { x: 0, y: 10 },
        locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
        walk: { type: "WalkMovement" as const, speed: 0.004 },
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
      {
        id: "pet-b",
        position: { x: 0, y: 10 },
        locomotion: { type: "LocomotionState" as const, baseMode: "fly" },
        walk: { type: "WalkMovement" as const, speed: 0.004 },
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

  it("creates upward jump force when jump is requested by a walking pet", () => {
    const jumpState = { type: "JumpState" as const, pending: true };
    const forces = runJumpSystem([
      {
        id: "pet-a",
        locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
        jump: { type: "JumpMovement" as const, impulse: 0.012 },
        jumpState,
      },
      {
        id: "pet-b",
        locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
        jump: { type: "JumpMovement" as const, impulse: 0.012 },
        jumpState: { type: "JumpState" as const, pending: false },
      },
    ]);

    expect(forces).toEqual([{ id: "pet-a", x: 0, y: -0.012 }]);
    expect(jumpState.pending).toBe(false);
  });

  it("does not keep applying jump force after the pending jump is consumed", () => {
    const jumpState = { type: "JumpState" as const, pending: true };
    const entity = {
      id: "pet-a",
      locomotion: { type: "LocomotionState" as const, baseMode: "walk" },
      jump: { type: "JumpMovement" as const, impulse: 0.012 },
      jumpState,
    } as const;

    expect(runJumpSystem([entity])).toEqual([{ id: "pet-a", x: 0, y: -0.012 }]);
    expect(runJumpSystem([entity])).toEqual([]);
  });

  it("creates vertical wall-climb force only when wall climbing is active", () => {
    const forces = runWallClimbSystem([
      {
        id: "pet-a",
        position: { x: 920, y: 420 },
        locomotion: { type: "LocomotionState" as const, baseMode: "climb" },
        wallClimb: { type: "WallClimbMovement" as const, speed: 0.003 },
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
        locomotion: { type: "LocomotionState" as const, baseMode: "climb" },
        wallClimb: { type: "WallClimbMovement" as const, speed: 0.003 },
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

  it("keeps wall-climbing pets attached to the contacted surface x position", () => {
    const forces = runWallClimbSystem([
      {
        id: "pet-a",
        position: { x: 132, y: 420 },
        locomotion: { type: "LocomotionState" as const, baseMode: "climb" },
        wallClimb: { type: "WallClimbMovement" as const, speed: 0.003 },
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

    expect(forces).toEqual([{ id: "pet-a", x: -0.006, y: -0.003 }]);
  });
});
