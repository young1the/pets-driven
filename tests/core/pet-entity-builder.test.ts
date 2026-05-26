import { describe, expect, it } from "vitest";
import { buildPersonalityComponents } from "@/core/pet-entity-builder";
import {
  createPlayfulPersonality,
  createAttentivePersonality,
  createReservedPersonality,
} from "@/pets/personalities/factories";

describe("pet entity builder", () => {
  it("converts playful personality to simulation components", () => {
    expect(buildPersonalityComponents(createPlayfulPersonality())).toEqual([
      { type: "MovementProfile", idleForce: 0.0008, activeForce: 0.0016, seekForce: 0.002 },
      { type: "IdleConversation", idleAfterMs: 9000 },
      { type: "CompletionBehavior", intentAfterCompletion: "seek" },
      {
        type: "Personality",
        openness: 0.7,
        conscientiousness: 0.4,
        extraversion: 0.85,
        agreeableness: 0.5,
        neuroticism: 0.1,
      },
    ]);
  });

  it("converts attentive personality to simulation components", () => {
    expect(buildPersonalityComponents(createAttentivePersonality())).toEqual([
      { type: "MovementProfile", idleForce: 0.0005, activeForce: 0.001, seekForce: 0.0016 },
      { type: "IdleConversation", idleAfterMs: 12000 },
      { type: "CompletionBehavior", intentAfterCompletion: "seek" },
      {
        type: "Personality",
        openness: 0.3,
        conscientiousness: 0.6,
        extraversion: 0.8,
        agreeableness: 0.8,
        neuroticism: 0.2,
      },
    ]);
  });

  it("omits IdleConversation when idleConversationMs is absent", () => {
    expect(buildPersonalityComponents(createReservedPersonality())).toEqual([
      { type: "MovementProfile", idleForce: 0.0004, activeForce: 0.0008, seekForce: 0.001 },
      { type: "CompletionBehavior", intentAfterCompletion: "idle" },
      {
        type: "Personality",
        openness: 0.3,
        conscientiousness: 0.5,
        extraversion: 0.2,
        agreeableness: 0.4,
        neuroticism: 0.75,
      },
    ]);
  });

  it("accepts an inline personality object", () => {
    expect(
      buildPersonalityComponents({
        idleForce: 0.001,
        activeForce: 0.002,
        seekForce: 0.003,
        completionIntent: "idle",
        openness: 0.5,
        conscientiousness: 0.4,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.2,
      }),
    ).toEqual([
      { type: "MovementProfile", idleForce: 0.001, activeForce: 0.002, seekForce: 0.003 },
      { type: "CompletionBehavior", intentAfterCompletion: "idle" },
      {
        type: "Personality",
        openness: 0.5,
        conscientiousness: 0.4,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.2,
      },
    ]);
  });
});
