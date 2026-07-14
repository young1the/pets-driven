import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentTaskEventSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import {
  initialMoodState,
  moodAdjustedDecisionScore,
  recordPetExperience,
  runMoodRecoverySystem,
} from "@pets-driven/pet-engine/features/mood/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

const CALM: PersonalityComponent = {
  type: "Personality",
  openness: 0.5,
  conscientiousness: 0.6,
  extraversion: 0.4,
  agreeableness: 0.7,
  neuroticism: 0.1,
};

const ANXIOUS: PersonalityComponent = {
  ...CALM,
  extraversion: 0.25,
  neuroticism: 0.95,
};

function moodStore(personality: PersonalityComponent = CALM) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        personality,
        initialMoodState(personality),
        { type: "RecentExperienceMemory", entries: [] },
      ],
    },
  ]);
}

describe("Mood and Recent Experience Memory", () => {
  it("derives a calmer, more confident baseline for a low-neuroticism pet", () => {
    const calm = initialMoodState(CALM);
    const anxious = initialMoodState(ANXIOUS);

    expect(calm.arousal).toBeLessThan(anxious.arousal);
    expect(calm.confidence).toBeGreaterThan(anxious.confidence);
  });

  it("records an experience and applies its emotional impact immediately", () => {
    const store = moodStore();
    const before = { ...store.getComponent("pet", "MoodState")! };

    recordPetExperience(store, "pet", "petted", 1_000);

    const mood = store.getComponent("pet", "MoodState")!;
    expect(mood.valence).toBeGreaterThan(before.valence);
    expect(mood.arousal).toBeLessThan(before.arousal);
    expect(mood.confidence).toBeGreaterThan(before.confidence);
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries).toEqual([
      expect.objectContaining({ kind: "petted", at: 1_000 }),
    ]);
  });

  it("bounds memory to the eight most recent experiences", () => {
    const store = moodStore();
    for (let index = 0; index < 12; index += 1) {
      recordPetExperience(store, "pet", "task-started", index * 100);
    }

    const entries = store.getComponent("pet", "RecentExperienceMemory")!.entries;
    expect(entries).toHaveLength(8);
    expect(entries[0].at).toBe(400);
    expect(entries[7].at).toBe(1_100);
  });

  it("expires old experiences and recovers mood toward personality baseline", () => {
    const store = moodStore();
    const mood = store.getComponent("pet", "MoodState")!;
    const baseline = initialMoodState(CALM);
    mood.valence = -0.8;
    mood.arousal = 1;
    mood.confidence = 0.05;
    store.getComponent("pet", "RecentExperienceMemory")!.entries = [
      {
        kind: "startled",
        at: 0,
        valenceDelta: -0.18,
        arousalDelta: 0.45,
        confidenceDelta: -0.2,
      },
    ];

    runMoodRecoverySystem(store, 50_000, 18_000);

    expect(store.getComponent("pet", "RecentExperienceMemory")!.entries).toEqual([]);
    expect(Math.abs(mood.valence)).toBeLessThan(0.8);
    expect(Math.abs(mood.arousal - baseline.arousal)).toBeLessThan(Math.abs(1 - baseline.arousal));
    expect(Math.abs(mood.confidence - baseline.confidence)).toBeLessThan(
      Math.abs(0.05 - baseline.confidence),
    );
  });

  it("turns a frightened mood toward flight and away from exploration", () => {
    const frightened = {
      type: "MoodState" as const,
      valence: -0.5,
      arousal: 1,
      confidence: 0.1,
    };
    const confident = {
      type: "MoodState" as const,
      valence: 0.3,
      arousal: 0.35,
      confidence: 0.9,
    };

    expect(moodAdjustedDecisionScore("collision-flee", 0, frightened)).toBeGreaterThan(
      moodAdjustedDecisionScore("collision-flee", 0, confident),
    );
    expect(moodAdjustedDecisionScore("wander-far", 0, frightened)).toBeLessThan(
      moodAdjustedDecisionScore("wander-far", 0, confident),
    );
  });

  it("records agent failures as negative, activating experiences", () => {
    const store = moodStore();
    store.setComponent("pet", { type: "AgentBinding", sourceId: "agent" });
    store.setComponent("pet", {
      type: "SpeechProfile",
      idleCompanion: "idle",
      attentionNeeded: "wait",
      taskStarted: "start",
      taskCompleted: "done",
    });
    store.setComponent("pet", { type: "SpeechState", speech: null, expiresAt: null });
    store.setComponent("pet", { type: "ActivityState", lastActiveAt: 0 });
    const before = { ...store.getComponent("pet", "MoodState")! };

    runAgentTaskEventSystem(
      store,
      [
        {
          kind: "agent",
          type: "task.failed",
          sourceId: "agent",
          at: 100,
        },
      ],
      createManualClock(100),
    );

    const mood = store.getComponent("pet", "MoodState")!;
    expect(mood.valence).toBeLessThan(before.valence);
    expect(mood.arousal).toBeGreaterThan(before.arousal);
    expect(mood.confidence).toBeLessThan(before.confidence);
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "task-failed",
    );
  });

  it("is backward compatible with pets that have no mood components", () => {
    const store = createComponentStore([{ id: "legacy", components: [CALM] }]);
    expect(() => recordPetExperience(store, "legacy", "petted", 0)).not.toThrow();
    expect(moodAdjustedDecisionScore("play-romp", 0.4, undefined)).toBe(0.4);
  });
});
