import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { width: 960, height: 540 };

function constantRandom(value: number): RandomSource {
  return { next: () => value };
}

/**
 * A floating pet (not grounded, not a walker) so the grounded-only poses
 * (groom / observe / fret) stay gated out and the decision pool is small. The
 * user anchor sits right on top of the pet (near), so seek-user and beckon —
 * which require the anchor to be *far* — are gated out too, leaving greet free
 * to win for a warm, extraverted personality.
 */
function makeGreetingStore(overrides?: {
  userAnchor?: {
    id: string;
    position: { x: number; y: number };
    distance: number;
  } | null;
}) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Steering", mode: "stand" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        {
          type: "Perception" as const,
          userAnchor:
            overrides?.userAnchor === undefined
              ? { id: "user", position: { x: 200, y: 200 }, distance: 0 }
              : overrides.userAnchor,
          nearbyPets: [],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          // Very warm and extraverted, calm and incurious: greet dominates the
          // softmax while wander-far / idle-stay score low.
          openness: 0,
          conscientiousness: 0,
          extraversion: 1,
          agreeableness: 1,
          neuroticism: 0,
        },
      ],
    },
  ]);
}

describe("greet expressive pose", () => {
  it("a warm extravert near someone selects greet and holds the claim for its duration", () => {
    const store = makeGreetingStore();

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.5), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("greet");

    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.source).toBe("autonomous");
    expect(claim?.reason).toBe("greet");
    // Sustained pose: the claim is held for the whole gesture (1400 + jitter),
    // not the 500ms autonomous default.
    const heldMs = claim!.expiresAt - claim!.decidedAt;
    expect(heldMs).toBeGreaterThanOrEqual(1_400);
    expect(heldMs).toBeLessThanOrEqual(2_200);
  });

  it("waves at the user when near, but beckons (not greets) when the user is far", () => {
    const far = makeGreetingStore({
      userAnchor: { id: "user", position: { x: 900, y: 500 }, distance: 762 },
    });

    runBehaviorDecisionSystem(far, createManualClock(0), constantRandom(0.5), BOUNDS);

    const offered =
      far
        .getComponent("pet", "BehaviorDecisionToken")
        ?.selectionTrace?.candidates.map((c) => c.kind) ?? [];
    expect(offered).not.toContain("greet");
    expect(offered).toContain("beckon");
  });

  it("does not offer greet when there is no user anchor", () => {
    const store = makeGreetingStore({ userAnchor: null });

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.5), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    const offered = token?.selectionTrace?.candidates.map((c) => c.kind) ?? [];
    expect(offered).not.toContain("greet");
  });
});

describe("expressive pose planning", () => {
  it("materializes a fret token into a stationary confused cue and consumes it", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "fret" as const,
            decidedAt: 1_000,
            consumed: false,
            activityDurationMs: 2_000,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "expressive",
      mood: "confused",
      // Fretting is anxiety, not alarm; the "!" stays with stand-lookout.
      emote: "sweat",
      expiresAt: 3_000,
    });
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("greet planning relieves a little of the social drive", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Drives" as const,
            social: 0.8,
            energy: 0.5,
            curiosity: 0.5,
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "greet" as const,
            decidedAt: 1_000,
            consumed: false,
            activityDurationMs: 1_600,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(1_000));

    expect(store.getComponent("pet", "Drives")?.social).toBeCloseTo(0.65);
  });
});
