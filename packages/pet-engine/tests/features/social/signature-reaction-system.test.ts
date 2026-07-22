import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component, PersonalityComponent } from "@pets-driven/pet-engine/core/components";
import { derivePetActivity } from "@pets-driven/pet-engine/core/pet-activity";
import { getPetAnimationState } from "@pets-driven/pet-engine/features/behavior/pet-animation-state";
import {
  MAX_SIGNATURE_RESPONDERS,
  runSignatureReactionSystem,
  SIGNATURE_REACTION_DURATION_MS,
  signatureReactionWeights,
} from "@pets-driven/pet-engine/features/social/signature-reactions";
import { PERSONALITY_REGISTRY } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 960, height: 540 };
const ALWAYS: RandomSource = { next: () => 0 };

function sequenceRandom(...values: number[]): RandomSource {
  let index = 0;
  return { next: () => values[Math.min(index++, values.length - 1)] ?? 0 };
}

function personality(catalogId: PetPersonalityId): PersonalityComponent {
  const factory = PERSONALITY_REGISTRY.find((entry) => entry.id === catalogId)?.factory;
  if (!factory) throw new Error(`Missing personality factory for ${catalogId}`);
  const traits = factory();
  return {
    type: "Personality",
    catalogId,
    openness: traits.openness,
    conscientiousness: traits.conscientiousness,
    extraversion: traits.extraversion,
    agreeableness: traits.agreeableness,
    neuroticism: traits.neuroticism,
  };
}

function petComponents(catalogId: PetPersonalityId, x: number): Component[] {
  return [
    { type: "PetIdentity", name: catalogId },
    { type: "CanSocialize" },
    { type: "Transform", position: { x, y: 500 } },
    { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
    { type: "Steering", mode: "stand" },
    { type: "MotionTarget", targetEntityId: null, targetPosition: null },
    personality(catalogId),
  ];
}

function signatureSource(catalogId: PetPersonalityId, reason: string, x = 200): Component[] {
  return [
    ...petComponents(catalogId, x),
    {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 100,
      expiresAt: 8_000,
      reason,
      lastAutonomousReason: reason,
      lastAutonomousAt: 100,
    },
  ];
}

function strongestReaction(catalogId: PetPersonalityId) {
  return signatureReactionWeights(personality(catalogId)).sort(
    (left, right) => right.weight - left.weight,
  )[0].kind;
}

describe("SignatureReactionSystem", () => {
  it("gives nearby pets distinct reaction preferences", () => {
    expect(strongestReaction("playful")).toBe("join");
    expect(strongestReaction("gentle")).toBe("cheer");
    expect(strongestReaction("shrewd")).toBe("watch");
    expect(strongestReaction("skittish")).toBe("keep-distance");
  });

  it("lets a playful neighbor join a held signature without changing its source", () => {
    const clock = createManualClock(100);
    const store = createComponentStore([
      { id: "source", components: signatureSource("lazy", "lounge") },
      { id: "observer", components: petComponents("playful", 300) },
    ]);

    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    expect(store.getComponent("source", "BehaviorDecisionState")).toMatchObject({
      source: "autonomous",
      reason: "lounge",
    });
    expect(store.getComponent("observer", "SignatureReactionState")).toMatchObject({
      sourceId: "source",
      sourceDecisionKind: "lounge",
      reaction: "join",
      pose: "lounge",
    });
    expect(store.getComponent("observer", "BehaviorDecisionState")).toMatchObject({
      source: "social",
      reason: "signature-reaction-join",
      expiresAt: 100 + SIGNATURE_REACTION_DURATION_MS,
    });
    expect(store.getComponent("observer", "PetExpressionState")).toMatchObject({
      source: "signature-reaction",
      mood: "sleepy",
      emote: "zzz",
    });
    expect(derivePetActivity(store, "observer", 100)).toBe("playing");
    expect(getPetAnimationState(store, "observer", 100)).toBe("idle");
    expect(getPetAnimationState(store, "observer", 1_100)).toBe("waving");
  });

  it("has a skittish neighbor give an energetic signature physical space", () => {
    const clock = createManualClock(100);
    const store = createComponentStore([
      { id: "source", components: signatureSource("playful", "caper", 300) },
      { id: "observer", components: petComponents("skittish", 380) },
    ]);

    // First roll accepts; the high second roll selects the final weighted
    // reaction, keep-distance, for this strongly skittish personality.
    runSignatureReactionSystem(store, clock, sequenceRandom(0, 0.99), BOUNDS);

    expect(store.getComponent("observer", "SignatureReactionState")?.reaction).toBe(
      "keep-distance",
    );
    expect(store.getComponent("observer", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("observer", "MotionTarget")?.targetPosition?.x).toBeGreaterThan(380);
    expect(store.getComponent("observer", "PetExpressionState")).toMatchObject({
      mood: "confused",
      emote: "sweat",
    });
    expect(derivePetActivity(store, "observer", 100)).toBe("keepingDistance");
  });

  it("rolls once per observer and caps responders for one signature occurrence", () => {
    const clock = createManualClock(100);
    const store = createComponentStore([
      { id: "source", components: signatureSource("zen", "center") },
      ...[0, 1, 2, 3].map((index) => ({
        id: `observer-${index}`,
        components: petComponents("playful", 260 + index * 20),
      })),
    ]);

    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);
    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    expect(store.components("SignatureReactionState").size).toBe(MAX_SIGNATURE_RESPONDERS);
    const seen = [...store.components("SignatureReactionMemory").values()].flatMap(
      (memory) => memory.entries,
    );
    expect(seen.filter((entry) => entry.reacted)).toHaveLength(MAX_SIGNATURE_RESPONDERS);
  });

  it("does not reroll a declined signature on later ticks", () => {
    const clock = createManualClock(100);
    const store = createComponentStore([
      { id: "source", components: signatureSource("zen", "meditate") },
      { id: "observer", components: petComponents("playful", 300) },
    ]);

    runSignatureReactionSystem(store, clock, { next: () => 0.99 }, BOUNDS);
    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    expect(store.getComponent("observer", "SignatureReactionState")).toBeUndefined();
    expect(store.getComponent("observer", "SignatureReactionMemory")?.entries).toEqual([
      { sourceId: "source", sourceDecisionAt: 100, reacted: false },
    ]);
  });

  it("ignores ordinary autonomous poses and active personal signatures", () => {
    const clock = createManualClock(100);
    const ordinaryStore = createComponentStore([
      { id: "ordinary", components: signatureSource("playful", "groom", 200) },
      { id: "observer", components: petComponents("playful", 340) },
    ]);
    runSignatureReactionSystem(ordinaryStore, clock, ALWAYS, BOUNDS);
    expect(ordinaryStore.getComponent("observer", "SignatureReactionState")).toBeUndefined();

    const signatureStore = createComponentStore([
      { id: "source", components: signatureSource("lazy", "lounge", 200) },
      { id: "own-signature", components: signatureSource("zen", "center", 280) },
    ]);
    runSignatureReactionSystem(signatureStore, clock, ALWAYS, BOUNDS);

    expect(signatureStore.getComponent("own-signature", "SignatureReactionState")).toBeUndefined();
    expect(signatureStore.getComponent("source", "SignatureReactionState")).toBeUndefined();
  });

  it("ends the reaction when the source signature ends", () => {
    const clock = createManualClock(100);
    const store = createComponentStore([
      { id: "source", components: signatureSource("lazy", "nap") },
      { id: "observer", components: petComponents("playful", 300) },
    ]);
    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    const sourceDecision = store.getComponent("source", "BehaviorDecisionState");
    if (!sourceDecision) throw new Error("Expected source decision");
    sourceDecision.expiresAt = 101;
    clock.advanceBy(2);
    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    expect(store.getComponent("observer", "SignatureReactionState")).toBeUndefined();
    expect(store.getComponent("observer", "PetExpressionState")).toBeUndefined();
    expect(store.getComponent("observer", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("observer", "BehaviorDecisionState")?.expiresAt).toBe(102);
  });

  it("yields to a user claim without clearing the user's movement", () => {
    const clock = createManualClock(100);
    const store = createComponentStore([
      { id: "source", components: signatureSource("lazy", "lounge") },
      { id: "observer", components: petComponents("playful", 300) },
    ]);
    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    store.setComponent("observer", {
      type: "BehaviorDecisionState",
      source: "user-interaction",
      decidedAt: 101,
      expiresAt: 2_000,
      reason: "dragging",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });
    store.setComponent("observer", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 500, y: 500 },
    });
    store.setComponent("observer", { type: "Steering", mode: "pursue" });
    clock.advanceBy(1);
    runSignatureReactionSystem(store, clock, ALWAYS, BOUNDS);

    expect(store.getComponent("observer", "SignatureReactionState")).toBeUndefined();
    expect(store.getComponent("observer", "BehaviorDecisionState")).toMatchObject({
      source: "user-interaction",
      reason: "dragging",
    });
    expect(store.getComponent("observer", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("observer", "MotionTarget")?.targetPosition).toEqual({
      x: 500,
      y: 500,
    });
  });
});
