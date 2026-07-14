import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  hoverReactionFor,
  runHoverReactionSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

const NEUTRAL_PERSONALITY = {
  openness: 0.3,
  conscientiousness: 0.3,
  extraversion: 0.3,
  agreeableness: 0.3,
  neuroticism: 0.3,
};

function makeStore(options?: {
  personality?: Partial<typeof NEUTRAL_PERSONALITY>;
  steeringMode?: "stand" | "arrive" | "pursue";
  cursorPosition?: { x: number; y: number } | null;
  held?: boolean;
  drag?: { entityId: string };
  claim?: { source: "user-interaction" | "autonomous"; expiresAt: number };
}) {
  const cursorPosition =
    options?.cursorPosition === undefined ? { x: 200, y: 200 } : options.cursorPosition;
  const steeringMode = options?.steeringMode ?? "arrive";

  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: cursorPosition ?? { x: 0, y: 0 } },
        { type: "CursorState", position: cursorPosition, samples: [] },
      ],
    },
    {
      id: "user-interaction",
      components: options?.drag
        ? [
            {
              type: "DragInteraction" as const,
              pointerId: 1,
              entityId: options.drag.entityId,
              phase: "dragging" as const,
              grabOffset: { x: 0, y: 0 },
              pointerPosition: cursorPosition ?? { x: 0, y: 0 },
              startedAt: 0,
              samples: [],
            },
          ]
        : [],
    },
    {
      id: "pet-a",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "PhysicsBody", shape: "rectangle" as const, width: 40, height: 40 },
        { type: "PetIdentity", name: "A" },
        {
          type: "Personality",
          ...NEUTRAL_PERSONALITY,
          ...options?.personality,
        },
        { type: "Steering" as const, mode: steeringMode },
        {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 400, y: 200 },
        },
        ...(options?.held ? [{ type: "TaskMovementHold" as const, since: 0 }] : []),
        ...(options?.claim
          ? [
              {
                type: "BehaviorDecisionState" as const,
                source: options.claim.source,
                decidedAt: 0,
                expiresAt: options.claim.expiresAt,
                reason: "existing",
                lastAutonomousReason: null,
                lastAutonomousAt: null,
              },
            ]
          : []),
      ],
    },
  ]);
}

describe("hoverReactionFor", () => {
  it("startles anxious pets", () => {
    const reaction = hoverReactionFor({
      type: "Personality",
      ...NEUTRAL_PERSONALITY,
      neuroticism: 0.9,
    });
    expect(reaction).toMatchObject({
      reason: "hover-startle",
      mood: "confused",
      emote: "exclaim",
    });
  });

  it("greets extraverted pets", () => {
    const reaction = hoverReactionFor({
      type: "Personality",
      ...NEUTRAL_PERSONALITY,
      extraversion: 0.9,
    });
    expect(reaction).toMatchObject({
      reason: "hover-greet",
      mood: "excited",
      emote: "sparkle",
    });
  });

  it("shows affection for agreeable pets", () => {
    const reaction = hoverReactionFor({
      type: "Personality",
      ...NEUTRAL_PERSONALITY,
      agreeableness: 0.9,
    });
    expect(reaction).toMatchObject({
      reason: "hover-affection",
      mood: "love",
      emote: "heart",
    });
  });

  it("turns curious for open pets", () => {
    const reaction = hoverReactionFor({
      type: "Personality",
      ...NEUTRAL_PERSONALITY,
      openness: 0.9,
    });
    expect(reaction).toMatchObject({
      reason: "hover-observe",
      mood: "thinking",
      emote: "question",
    });
  });

  it("resolves ties deterministically — startle wins over greet", () => {
    const reaction = hoverReactionFor({
      type: "Personality",
      ...NEUTRAL_PERSONALITY,
      neuroticism: 0.8,
      extraversion: 0.8,
    });
    expect(reaction.reason).toBe("hover-startle");
  });
});

describe("runHoverReactionSystem", () => {
  it("stops a moving pet under the cursor and claims a personality reaction", () => {
    const store = makeStore({ personality: { extraversion: 0.9 } });
    const velocities: Array<{ x?: number; y?: number }> = [];

    runHoverReactionSystem(store, createManualClock(1_000), {
      setVelocity: (_id, v) => velocities.push(v),
    });

    const decision = store.getComponent("pet-a", "BehaviorDecisionState");
    expect(decision?.source).toBe("user-interaction");
    expect(decision?.reason).toBe("hover-greet");
    expect(decision?.expiresAt).toBeGreaterThan(1_000);

    // The pet is parked: steering stands, the motion target is cleared, and
    // velocity is zeroed.
    expect(store.getComponent("pet-a", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(velocities).toContainEqual({ x: 0, y: 0 });

    const expression = store.getComponent("pet-a", "PetExpressionState");
    expect(expression?.source).toBe("hover");
    expect(expression?.mood).toBe("excited");
    expect(expression?.emote).toBe("sparkle");
  });

  it("ignores a pet that is already standing", () => {
    const store = makeStore({ steeringMode: "stand" });

    runHoverReactionSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
    expect(store.getComponent("pet-a", "PetExpressionState")).toBeUndefined();
  });

  it("ignores a pet held by an agent task hold", () => {
    const store = makeStore({ held: true });

    runHoverReactionSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("ignores the cursor when it is outside the pet's body", () => {
    const store = makeStore({ cursorPosition: { x: 500, y: 200 } });

    runHoverReactionSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("does nothing while the pet is being dragged", () => {
    const store = makeStore({ drag: { entityId: "pet-a" } });

    runHoverReactionSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("does not steal a live user-interaction claim (e.g. petting)", () => {
    const store = makeStore({
      claim: { source: "user-interaction", expiresAt: 2_000 },
    });

    runHoverReactionSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.reason).toBe("existing");
  });

  it("overrides a lower-priority autonomous claim", () => {
    const store = makeStore({
      claim: { source: "autonomous", expiresAt: 2_000 },
      personality: { openness: 0.9 },
    });

    runHoverReactionSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.reason).toBe("hover-observe");
  });

  it("does not re-extend its own claim while the cursor keeps hovering", () => {
    const store = makeStore();

    runHoverReactionSystem(store, createManualClock(1_000));
    const firstExpiresAt = store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt;

    // Pet now stands; a later tick with the cursor still on it must not
    // refresh the claim — petting needs the claim to expire to take over.
    runHoverReactionSystem(store, createManualClock(1_500));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt).toBe(firstExpiresAt);
  });
});
