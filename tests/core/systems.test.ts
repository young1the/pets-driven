import { describe, expect, it } from "vitest";
import { PET_SPEECH } from "@/core/constants/pet-speech";
import { runIdleConversationSystem } from "@/core/systems/idle-conversation-system";
import { computeSeparationForces } from "@/core/systems/separation-steering-system";
import { runStimulusReactionSystem } from "@/core/systems/stimulus-reaction-system";
import { createManualClock } from "@/shared/time/manual-clock";

describe("behavior systems", () => {
  it("creates a speech bubble after a talkative pet idles long enough", () => {
    const clock = createManualClock(0);
    const pet = {
      id: "pet-a",
      components: {
        Talkative: { type: "Talkative" as const, idleAfterMs: 5_000 },
      },
      runtime: { lastActiveAt: 0, speech: null as string | null, intent: "idle" },
    };

    clock.advanceBy(5_000);
    runIdleConversationSystem([pet], clock);

    expect(pet.runtime.speech).toBe(PET_SPEECH.idleCompanion);
  });

  it("turns waiting stimuli into an attention-seeking intent", () => {
    const pet = {
      id: "pet-a",
      sourceId: "agent-a",
      runtime: { intent: "idle", speech: null as string | null },
    };

    runStimulusReactionSystem([pet], [
      { type: "task.waiting", sourceId: "agent-a", at: 10, summary: "Needs approval" },
    ]);

    expect(pet.runtime.intent).toBe("seek-user");
    expect(pet.runtime.speech).toBe("Needs approval");
  });

  it("pushes nearby pets away from each other", () => {
    const [first, second] = computeSeparationForces(
      [
        { id: "a", x: 100, y: 100 },
        { id: "b", x: 110, y: 100 },
      ],
      40,
    );

    expect(first.x).toBeLessThan(0);
    expect(second.x).toBeGreaterThan(0);
  });
});
