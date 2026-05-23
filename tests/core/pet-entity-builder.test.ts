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
      { type: "MovementProfile", idleSpeed: 0.0008, activeSpeed: 0.0016, seekSpeed: 0.002 },
      { type: "IdleConversation", idleAfterMs: 9000 },
      { type: "CompletionBehavior", intentAfterCompletion: "seek" },
      { type: "BehaviorPreference", curiosity: 0.7, sociability: 0.4, playfulness: 0.9, shyness: 0.1 },
    ]);
  });

  it("converts attentive personality to simulation components", () => {
    expect(buildPersonalityComponents(createAttentivePersonality())).toEqual([
      { type: "MovementProfile", idleSpeed: 0.0005, activeSpeed: 0.001, seekSpeed: 0.0016 },
      { type: "IdleConversation", idleAfterMs: 12000 },
      { type: "CompletionBehavior", intentAfterCompletion: "seek" },
      { type: "BehaviorPreference", curiosity: 0.3, sociability: 0.85, playfulness: 0.3, shyness: 0.2 },
    ]);
  });

  it("omits IdleConversation when idleConversationMs is absent", () => {
    expect(buildPersonalityComponents(createReservedPersonality())).toEqual([
      { type: "MovementProfile", idleSpeed: 0.0004, activeSpeed: 0.0008, seekSpeed: 0.001 },
      { type: "CompletionBehavior", intentAfterCompletion: "idle" },
      { type: "BehaviorPreference", curiosity: 0.2, sociability: 0.2, playfulness: 0.15, shyness: 0.75 },
    ]);
  });

  it("accepts an inline personality object", () => {
    expect(
      buildPersonalityComponents({
        idleSpeed: 0.001,
        activeSpeed: 0.002,
        seekSpeed: 0.003,
        completionIntent: "idle",
        curiosity: 0.5,
        sociability: 0.5,
        playfulness: 0.5,
        shyness: 0.2,
      }),
    ).toEqual([
      { type: "MovementProfile", idleSpeed: 0.001, activeSpeed: 0.002, seekSpeed: 0.003 },
      { type: "CompletionBehavior", intentAfterCompletion: "idle" },
      { type: "BehaviorPreference", curiosity: 0.5, sociability: 0.5, playfulness: 0.5, shyness: 0.2 },
    ]);
  });
});
