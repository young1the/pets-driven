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
    ]);
  });

  it("converts attentive personality to simulation components", () => {
    expect(buildPersonalityComponents(createAttentivePersonality())).toEqual([
      { type: "MovementProfile", idleSpeed: 0.0005, activeSpeed: 0.001, seekSpeed: 0.0016 },
      { type: "IdleConversation", idleAfterMs: 12000 },
      { type: "CompletionBehavior", intentAfterCompletion: "seek" },
    ]);
  });

  it("omits IdleConversation when idleConversationMs is absent", () => {
    expect(buildPersonalityComponents(createReservedPersonality())).toEqual([
      { type: "MovementProfile", idleSpeed: 0.0004, activeSpeed: 0.0008, seekSpeed: 0.001 },
      { type: "CompletionBehavior", intentAfterCompletion: "idle" },
    ]);
  });

  it("accepts an inline personality object", () => {
    expect(
      buildPersonalityComponents({
        idleSpeed: 0.001,
        activeSpeed: 0.002,
        seekSpeed: 0.003,
        completionIntent: "idle",
      }),
    ).toEqual([
      { type: "MovementProfile", idleSpeed: 0.001, activeSpeed: 0.002, seekSpeed: 0.003 },
      { type: "CompletionBehavior", intentAfterCompletion: "idle" },
    ]);
  });
});
