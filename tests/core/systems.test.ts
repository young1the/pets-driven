import { describe, expect, it } from "vitest";
import { DEFAULT_PET_SPEECH } from "@/core/constants/pet-speech";
import { runAvoidancePlanningSystem } from "@/core/systems/avoidance-planning-system";
import { runPhysicsIntegrationSystem } from "@/core/systems/physics-integration-system";
import { runPhysicsTransformSyncSystem } from "@/core/systems/physics-transform-sync-system";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { createManualClock } from "@/shared/time/manual-clock";

describe("behavior systems", () => {
  it("creates a speech bubble after a talkative pet idles long enough", () => {
    const clock = createManualClock(0);
    const pet = {
      id: "pet-a",
      idleConversation: { type: "IdleConversation" as const, idleAfterMs: 5_000 },
      speechProfile: {
        type: "SpeechProfile" as const,
        idleCompanion: "Custom idle line",
        attentionNeeded: DEFAULT_PET_SPEECH.attentionNeeded,
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
      },
      activity: { type: "ActivityState" as const, lastActiveAt: 0 },
    };

    runStimulusReactionSystem([pet], [
      { type: "task.waiting", sourceId: "agent-a", at: 10 },
    ]);

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
      },
      speech: {
        type: "SpeechState" as const,
        speech: "Old message" as string | null,
      },
      activity: {
        type: "ActivityState" as const,
        lastActiveAt: 0,
      },
    };

    runStimulusReactionSystem([pet], [
      { type: "task.started", sourceId: "agent-a", at: 10, summary: "Working" },
    ]);

    expect(pet.intent.intent).toBe("active");
    expect(pet.speech.speech).toBeNull();
    expect(pet.activity.lastActiveAt).toBe(10);
  });

  it("turns completed stimuli into idle pets with a summary", () => {
    const pet = {
      id: "pet-a",
      agent: { type: "AgentBinding" as const, sourceId: "agent-a" },
      intent: { type: "IntentState" as const, intent: "seek" as const },
      speechProfile: {
        type: "SpeechProfile" as const,
        idleCompanion: DEFAULT_PET_SPEECH.idleCompanion,
        attentionNeeded: DEFAULT_PET_SPEECH.attentionNeeded,
      },
      speech: {
        type: "SpeechState" as const,
        speech: null as string | null,
      },
      activity: {
        type: "ActivityState" as const,
        lastActiveAt: 0,
      },
    };

    runStimulusReactionSystem([pet], [
      { type: "task.completed", sourceId: "agent-a", at: 20, summary: "Done" },
    ]);

    expect(pet.intent.intent).toBe("idle");
    expect(pet.speech.speech).toBe("Done");
    expect(pet.activity.lastActiveAt).toBe(20);
  });

  it("plans an avoidance waypoint before a pet reaches another pet", () => {
    const pet = {
      id: "pet-a",
      position: { x: 0, y: 0 },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: "user-anchor",
        targetPosition: { x: 120, y: 0 },
      },
      navigation: {
        type: "NavigationState" as const,
        avoidanceWaypoint: null as { x: number; y: number } | null,
      },
    };

    runAvoidancePlanningSystem(
      [pet],
      [
        { id: "pet-a", position: { x: 0, y: 0 } },
        { id: "pet-b", position: { x: 60, y: 0 } },
      ],
    );

    expect(pet.navigation.avoidanceWaypoint).toEqual({
      x: 60,
      y: -72,
    });
  });

  it("merges steering forces by entity before stepping physics", () => {
    const appliedForces: Array<{ id: string; force: { x: number; y: number } }> = [];
    const physics = {
      applyForce(id: string, force: { x: number; y: number }) {
        appliedForces.push({ id, force });
      },
      step() {},
    };

    runPhysicsIntegrationSystem({
      physics,
      deltaMs: 16,
      forceGroups: [[{ id: "pet-a", x: 1, y: 2 }], [{ id: "pet-a", x: 0.5, y: -1 }]],
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

    const snapshot = runPhysicsTransformSyncSystem([{ id: "pet-a", transform }], physics);

    expect(transform.position).toEqual({ x: 42, y: 24 });
    expect(snapshot.bodies[0]?.id).toBe("pet-a");
  });
});
