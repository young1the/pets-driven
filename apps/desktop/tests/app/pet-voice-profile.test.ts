import {
  createLazyPersonality,
  createPlayfulPersonality,
  createSkittishPersonality,
  createSteadyPersonality,
} from "@pets-driven/pet-engine/pets/personalities/factories";
import { describe, expect, it } from "vitest";
import { voiceProfileForPersonality } from "@/app/voice/pet-voice-profile";

describe("voiceProfileForPersonality", () => {
  it("makes an energetic pet speak faster than a relaxed pet", () => {
    const playful = voiceProfileForPersonality(createPlayfulPersonality(), 1.4);
    const lazy = voiceProfileForPersonality(createLazyPersonality(), 1.4);

    expect(playful.speed).toBeGreaterThan(lazy.speed);
    expect(playful.spaceDelay).toBeLessThan(lazy.spaceDelay);
    expect(playful.punctuationDelay).toBeLessThan(lazy.punctuationDelay);
  });

  it("gives a confident pet less pitch randomness than an anxious pet", () => {
    const steady = voiceProfileForPersonality(createSteadyPersonality(), 1.4);
    const skittish = voiceProfileForPersonality(createSkittishPersonality(), 1.4);

    expect(steady.randomness).toBeLessThan(skittish.randomness);
  });

  it("clamps an edited pitch to the supported synthesis range", () => {
    expect(voiceProfileForPersonality(createSteadyPersonality(), 20).pitch).toBe(1.9);
    expect(voiceProfileForPersonality(createSteadyPersonality(), -20).pitch).toBe(0.9);
  });
});
