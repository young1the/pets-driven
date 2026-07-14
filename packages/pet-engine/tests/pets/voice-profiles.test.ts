import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import {
  PERSONALITY_VOICE_PROFILES,
  personalityAcknowledgeFeedback,
  personalitySpeechProfile,
} from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import { describe, expect, it } from "vitest";

describe("Personality Catalog voice profiles", () => {
  it("defines one voice for every catalog entry", () => {
    expect(Object.keys(PERSONALITY_VOICE_PROFILES).sort()).toEqual(
      PERSONALITY_REGISTRY.map((entry) => entry.id).sort(),
    );
  });

  it("gives every personality a distinct idle voice", () => {
    const lines = Object.values(PERSONALITY_VOICE_PROFILES).map((profile) => profile.idleCompanion);
    expect(new Set(lines).size).toBe(PERSONALITY_REGISTRY.length);
  });

  it("returns a SpeechProfile component without acknowledgement internals", () => {
    expect(personalitySpeechProfile("mischievous")).toEqual({
      type: "SpeechProfile",
      idleCompanion: "I am definitely behaving.",
      attentionNeeded: "Psst. Come look at this.",
      taskStarted: "Leave it to me. Probably.",
      taskCompleted: "Done. Nothing suspicious happened.",
    });
  });

  it("varies acknowledgement feedback by personality and task outcome", () => {
    expect(personalityAcknowledgeFeedback("lazy", "completed")).toMatchObject({
      mood: "sleepy",
      emote: "zzz",
    });
    expect(personalityAcknowledgeFeedback("skittish", "failed")).toMatchObject({
      mood: "confused",
      emote: "exclaim",
    });
    expect(personalityAcknowledgeFeedback("steady", "waiting")).toMatchObject({
      mood: "working",
      emote: "none",
    });
  });

  it("leaves legacy personalities and non-freezing task states unchanged", () => {
    expect(personalitySpeechProfile(undefined)).toBeNull();
    expect(personalityAcknowledgeFeedback(undefined, "completed")).toBeNull();
    expect(personalityAcknowledgeFeedback("playful", "working")).toBeNull();
  });
});
