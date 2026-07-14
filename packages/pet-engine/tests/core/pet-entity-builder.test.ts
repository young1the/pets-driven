import { buildPersonalityComponents } from "@pets-driven/pet-engine/core/pet-entity-builder";
import {
  createAttentivePersonality,
  createPlayfulPersonality,
  createReservedPersonality,
} from "@pets-driven/pet-engine/pets/personalities/factories";
import { describe, expect, it } from "vitest";

describe("pet entity builder", () => {
  it("converts playful personality to simulation components", () => {
    expect(buildPersonalityComponents(createPlayfulPersonality())).toEqual([
      { type: "MovementProfile", standForce: 0.0008, pursueForce: 0.0016, arriveForce: 0.002 },
      { type: "IdleConversation", idleAfterMs: 9000 },
      { type: "CompletionBehavior", intentAfterCompletion: "arrive" },
      {
        type: "Personality",
        openness: 0.75,
        conscientiousness: 0.3,
        extraversion: 0.95,
        agreeableness: 0.55,
        neuroticism: 0.08,
      },
    ]);
  });

  it("converts attentive personality to simulation components", () => {
    expect(buildPersonalityComponents(createAttentivePersonality())).toEqual([
      { type: "MovementProfile", standForce: 0.0005, pursueForce: 0.001, arriveForce: 0.0016 },
      { type: "IdleConversation", idleAfterMs: 11000 },
      { type: "CompletionBehavior", intentAfterCompletion: "arrive" },
      {
        type: "Personality",
        openness: 0.25,
        conscientiousness: 0.72,
        extraversion: 0.72,
        agreeableness: 0.95,
        neuroticism: 0.15,
      },
    ]);
  });

  it("omits IdleConversation when idleConversationMs is absent", () => {
    expect(buildPersonalityComponents(createReservedPersonality())).toEqual([
      { type: "MovementProfile", standForce: 0.0004, pursueForce: 0.0008, arriveForce: 0.001 },
      { type: "CompletionBehavior", intentAfterCompletion: "stand" },
      {
        type: "Personality",
        openness: 0.22,
        conscientiousness: 0.55,
        extraversion: 0.12,
        agreeableness: 0.38,
        neuroticism: 0.82,
      },
    ]);
  });

  it("accepts an inline personality object", () => {
    expect(
      buildPersonalityComponents({
        standForce: 0.001,
        pursueForce: 0.002,
        arriveForce: 0.003,
        completionIntent: "stand",
        openness: 0.5,
        conscientiousness: 0.4,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.2,
      }),
    ).toEqual([
      { type: "MovementProfile", standForce: 0.001, pursueForce: 0.002, arriveForce: 0.003 },
      { type: "CompletionBehavior", intentAfterCompletion: "stand" },
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
