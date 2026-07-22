import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import {
  PERSONALITY_VOICE_PROFILES,
  PET_SPEECH_KEY_PREFIX,
  PET_SPEECH_VARIANT_COUNT,
  personalityAcknowledgeFeedback,
  personalitySpeechProfile,
  resolveSpeechVariant,
} from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { describe, expect, it } from "vitest";

describe("Personality Catalog voice profiles", () => {
  it("defines an acknowledgement cue for every catalog entry", () => {
    expect(Object.keys(PERSONALITY_VOICE_PROFILES).sort()).toEqual(
      PERSONALITY_REGISTRY.map((entry) => entry.id).sort(),
    );
  });

  it("gives every personality a distinct base speech key namespace", () => {
    const keys = Object.keys(PERSONALITY_VOICE_PROFILES).map(
      (id) => personalitySpeechProfile(id as never)?.idleCompanion,
    );
    expect(new Set(keys).size).toBe(PERSONALITY_REGISTRY.length);
  });

  it("returns a SpeechProfile of localizable base keys (no acknowledgement internals)", () => {
    expect(personalitySpeechProfile("mischievous")).toEqual({
      type: "SpeechProfile",
      idleCompanion: "petSpeech.mischievous.idle",
      attentionNeeded: "petSpeech.mischievous.attention",
      taskStarted: "petSpeech.mischievous.started",
      taskCompleted: "petSpeech.mischievous.completed",
    });
  });

  it("resolves a random in-range variant key at speak time", () => {
    const random = createSeededRandom(7);
    const key = resolveSpeechVariant("petSpeech.playful.idle", random);
    expect(key).toMatch(/^petSpeech\.playful\.idle\.[0-3]$/);
    const variant = Number(key?.split(".").at(-1));
    expect(variant).toBeGreaterThanOrEqual(0);
    expect(variant).toBeLessThan(PET_SPEECH_VARIANT_COUNT);
  });

  it("passes free text and null through resolveSpeechVariant untouched", () => {
    const random = createSeededRandom(1);
    expect(resolveSpeechVariant("Fixed the flaky test", random)).toBe("Fixed the flaky test");
    expect(resolveSpeechVariant(null, random)).toBeNull();
  });

  it("varies acknowledgement feedback by personality and task outcome", () => {
    const random = createSeededRandom(3);
    expect(personalityAcknowledgeFeedback("lazy", "completed", random)).toMatchObject({
      mood: "sleepy",
      emote: "zzz",
    });
    const failed = personalityAcknowledgeFeedback("skittish", "failed", random);
    expect(failed).toMatchObject({ mood: "confused", emote: "exclaim" });
    expect(failed?.speech).toMatch(
      new RegExp(`^${PET_SPEECH_KEY_PREFIX}\\.skittish\\.ackFailed\\.[0-3]$`),
    );
    expect(personalityAcknowledgeFeedback("steady", "waiting", random)).toMatchObject({
      mood: "working",
      emote: "none",
    });
  });

  it("leaves legacy personalities and non-freezing task states unchanged", () => {
    const random = createSeededRandom(1);
    expect(personalitySpeechProfile(undefined)).toBeNull();
    expect(personalityAcknowledgeFeedback(undefined, "completed", random)).toBeNull();
    expect(personalityAcknowledgeFeedback("playful", "working", random)).toBeNull();
  });
});
