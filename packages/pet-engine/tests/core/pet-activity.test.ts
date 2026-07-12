import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component } from "@pets-driven/pet-engine/core/components";
import { derivePetActivity } from "@pets-driven/pet-engine/core/pet-activity";

function storeWith(components: Component[]) {
  const hasIntent = components.some((c) => c.type === "Steering");
  return createComponentStore([
    {
      id: "pet",
      components: [
        ...(hasIntent
          ? []
          : [{ type: "Steering", mode: "stand" } as const]),
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

function steering(value: "stand" | "pursue" | "arrive"): Component {
  return { type: "Steering", mode: value };
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
      steering("pursue"),
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
      steering("pursue"),
      decision("wander-far"),
    ]);
    expect(derivePetActivity(store, "pet", 100)).toBe("climbing");
  });

  it("maps jump state and airborne to hopping / mid-air", () => {
    expect(
      derivePetActivity(
        storeWith([
          {
            type: "JumpActionState",
            phase: "requested" as const,
            cooldownMs: 0,
          },
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
    const store = storeWith([steering("pursue"), decision("chase-cursor")]);
    expect(derivePetActivity(store, "pet", 100)).toBe("chasingCursor");
  });

  it("keeps the decision label while the movement is still executing, even after the claim expires", () => {
    const store = storeWith([
      steering("pursue"),
      decision("wander-far", { expiresAt: 500 }),
    ]);
    // Claim expired at 500, but the walk it started is still running.
    expect(derivePetActivity(store, "pet", 3_000)).toBe("exploring");
  });

  it("drops a stale decision once the pet is idle again", () => {
    const store = storeWith([
      steering("stand"),
      decision("collision-flee", { expiresAt: 500 }),
    ]);
    // Fled seconds ago and now stands still: no more "keeping distance".
    expect(derivePetActivity(store, "pet", 3_000)).toBeNull();
  });

  it("shows an unexpired cue even while idle (approach-pet-success)", () => {
    const store = storeWith([
      steering("stand"),
      decision("approach-pet-success", { decidedAt: 0, expiresAt: 1_000 }),
    ]);
    expect(derivePetActivity(store, "pet", 500)).toBe("foundAFriend");
  });

  it("falls back to coarse intent for unmapped reasons", () => {
    const store = storeWith([steering("pursue"), decision("collision-stay")]);
    expect(derivePetActivity(store, "pet", 100)).toBe("onTheMove");
    expect(
      derivePetActivity(storeWith([steering("arrive")]), "pet", 100),
    ).toBe("headingOver");
  });

  it("maps the expressive idle poses from their sustained standing claim", () => {
    const cases: Array<[string, string]> = [
      ["greet", "greeting"],
      ["groom", "grooming"],
      ["observe", "observing"],
      ["beckon", "beckoning"],
      ["fret", "fretting"],
      ["nap", "napping"],
      ["meditate", "meditating"],
      ["play-feint", "teasing"],
    ];
    for (const [reason, expected] of cases) {
      // Stationary (stand) but the pose claim is still live.
      const store = storeWith([
        steering("stand"),
        decision(reason, { decidedAt: 0, expiresAt: 2_000 }),
      ]);
      expect(derivePetActivity(store, "pet", 500)).toBe(expected);
    }
  });

  it("reads a standing chat session as chatting (idle but unexpired claim)", () => {
    // Chat play phase stops the pets (idle) but the session re-claims each
    // tick, so the social claim stays unexpired and owns the Activity.
    const store = storeWith([
      steering("stand"),
      { type: "BehaviorDecisionState", source: "social", decidedAt: 0, expiresAt: 250, reason: "session-chat", lastAutonomousReason: null, lastAutonomousAt: null },
    ]);
    expect(derivePetActivity(store, "pet", 100)).toBe("chatting");
  });

  it("maps the social session kinds and afterglow to their activities", () => {
    const cases: Array<[string, string]> = [
      ["session-greet", "makingFriends"],
      ["session-chase", "playing"],
      ["social-invite", "makingFriends"],
      ["socialized", "foundAFriend"],
    ];
    for (const [reason, expected] of cases) {
      const store = storeWith([
        steering("stand"),
        { type: "BehaviorDecisionState", source: "social", decidedAt: 0, expiresAt: 1_000, reason, lastAutonomousReason: null, lastAutonomousAt: null },
      ]);
      expect(derivePetActivity(store, "pet", 200)).toBe(expected);
    }
  });
});
