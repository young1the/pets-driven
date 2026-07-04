import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component } from "@pets-driven/pet-engine/core/components";
import { derivePetActivity } from "@pets-driven/pet-engine/core/pet-activity";

function storeWith(components: Component[]) {
  const hasIntent = components.some((c) => c.type === "IntentState");
  return createComponentStore([
    {
      id: "pet",
      components: [
        ...(hasIntent
          ? []
          : [{ type: "IntentState", intent: "idle" } as const]),
        ...components,
      ],
    },
  ]);
}

function decision(
  reason: string,
  overrides: Partial<{ decidedAt: number; expiresAt: number }> = {},
): Component {
  return {
    type: "BehaviorDecisionState",
    source: "autonomous",
    decidedAt: overrides.decidedAt ?? 0,
    expiresAt: overrides.expiresAt ?? 500,
    reason,
    lastAutonomousReason: null,
    lastAutonomousAt: null,
  };
}

function intent(value: "idle" | "active" | "seek"): Component {
  return { type: "IntentState", intent: value };
}

describe("derivePetActivity", () => {
  it("returns null for a pet that is simply standing by", () => {
    expect(derivePetActivity(storeWith([]), "pet", 1_000)).toBeNull();
  });

  it("an active petting expression wins over everything else", () => {
    const store = storeWith([
      {
        type: "PetExpressionState",
        source: "petting",
        mood: "love",
        emote: "heart",
        label: null,
        startedAt: 0,
        expiresAt: 900,
      },
      intent("active"),
      decision("wander-far"),
    ]);
    expect(derivePetActivity(store, "pet", 100)).toBe("beingPetted");
  });

  it("an expired expression falls through to the next signal", () => {
    const store = storeWith([
      {
        type: "PetExpressionState",
        source: "chase-cursor",
        mood: "excited",
        emote: "sparkle",
        label: null,
        startedAt: 0,
        expiresAt: 900,
      },
    ]);
    expect(derivePetActivity(store, "pet", 1_000)).toBeNull();
  });

  it("a pending reaction reads as startled until it resolves", () => {
    const store = storeWith([
      {
        type: "PendingReaction",
        source: "collision" as const,
        triggeredAt: 0,
        reactsAt: 400,
        context: {},
      },
    ]);
    expect(derivePetActivity(store, "pet", 200)).toBe("startled");
    expect(derivePetActivity(store, "pet", 400)).toBeNull();
  });

  it("physical action outranks the decision claim", () => {
    const store = storeWith([
      { type: "ClimbingTag" },
      intent("active"),
      decision("wander-far"),
    ]);
    expect(derivePetActivity(store, "pet", 100)).toBe("climbing");
  });

  it("maps jump state and airborne to hopping / mid-air", () => {
    expect(
      derivePetActivity(
        storeWith([
          { type: "JumpActionState", phase: "crouch" as const, cooldownMs: 0 },
        ]),
        "pet",
        0,
      ),
    ).toBe("hopping");
    expect(
      derivePetActivity(storeWith([{ type: "AirborneTag" }]), "pet", 0),
    ).toBe("midAir");
  });

  it("maps the cursor-play decisions", () => {
    const store = storeWith([intent("active"), decision("chase-cursor")]);
    expect(derivePetActivity(store, "pet", 100)).toBe("chasingCursor");
  });

  it("keeps the decision label while the movement is still executing, even after the claim expires", () => {
    const store = storeWith([
      intent("active"),
      decision("wander-far", { expiresAt: 500 }),
    ]);
    // Claim expired at 500, but the walk it started is still running.
    expect(derivePetActivity(store, "pet", 3_000)).toBe("exploring");
  });

  it("drops a stale decision once the pet is idle again", () => {
    const store = storeWith([
      intent("idle"),
      decision("collision-flee", { expiresAt: 500 }),
    ]);
    // Fled seconds ago and now stands still: no more "keeping distance".
    expect(derivePetActivity(store, "pet", 3_000)).toBeNull();
  });

  it("shows an unexpired cue even while idle (approach-pet-success)", () => {
    const store = storeWith([
      intent("idle"),
      decision("approach-pet-success", { decidedAt: 0, expiresAt: 1_000 }),
    ]);
    expect(derivePetActivity(store, "pet", 500)).toBe("foundAFriend");
  });

  it("falls back to coarse intent for unmapped reasons", () => {
    const store = storeWith([intent("active"), decision("collision-stay")]);
    expect(derivePetActivity(store, "pet", 100)).toBe("onTheMove");
    expect(
      derivePetActivity(storeWith([intent("seek")]), "pet", 100),
    ).toBe("headingOver");
  });
});
