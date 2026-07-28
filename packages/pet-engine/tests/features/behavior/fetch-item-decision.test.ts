import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runBehaviorDecisionSystem } from "@pets-driven/pet-engine/features/behavior/decision-system";
import { runBehaviorPlanningSystem } from "@pets-driven/pet-engine/features/behavior/planning-system";
import type { PerceivedEntity } from "@pets-driven/pet-engine/features/perception/components";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { width: 1920, height: 1080 };

/**
 * The softmax walks candidates in push order, so a roll near 0 always lands on
 * the first one regardless of score. A mid roll lands inside the widest band,
 * which for this pet is fetch-item — the point being tested.
 */
function constantRandom(value: number): RandomSource {
  return { next: () => value };
}

function nearbyItem(id: string, x: number, y: number): PerceivedEntity {
  return { id, position: { x, y }, distance: Math.hypot(x - 400, y - 1000) };
}

function makeStore(options?: { items?: PerceivedEntity[]; carrying?: boolean }) {
  const store = createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 400, y: 1000 } },
        { type: "Steering", mode: "stand" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "WalkingTag" as const },
        { type: "CanWalk" as const, force: 0.01 },
        {
          type: "Perception" as const,
          userAnchor: null,
          nearbyPets: [],
          nearbyClimbables: [],
          nearbyItems: options?.items ?? [],
          self: { grounded: true, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          openness: 0.7,
          conscientiousness: 0.4,
          extraversion: 0.6,
          agreeableness: 0.5,
          // Low neuroticism keeps the softmax concentrated on the top scorer.
          neuroticism: 0.05,
        },
      ],
    },
  ]);

  if (options?.carrying) {
    store.setComponent("pet", {
      type: "CarriedItem",
      kind: "wings",
      pickedUpAt: 0,
      expiresAt: 60_000,
    });
  }

  return store;
}

describe("fetch-item decision", () => {
  it("sends a pet after the nearest trinket it can see", () => {
    const store = makeStore({ items: [nearbyItem("item-wings-0", 900, 1000)] });

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.5), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("fetch-item");
    expect(token?.targetPosition).toEqual({ x: 900, y: 1000 });
    // A position, not an entity target: an entity target would drop
    // ArrivalBehaviorSystem into its approach-pet branch, which never clears it.
    expect(token?.targetEntityId).toBeUndefined();
  });

  it("materializes the token into a walk toward the trinket", () => {
    const store = makeStore({ items: [nearbyItem("item-wings-0", 900, 1000)] });

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.5), BOUNDS);
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 900,
      y: 1000,
    });
  });

  it("leaves the next trinket alone while the pet already wears an ability", () => {
    const store = makeStore({
      items: [nearbyItem("item-claws-0", 900, 1000)],
      carrying: true,
    });

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.5), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).not.toBe("fetch-item");
  });

  it("never sends two pets after the same trinket in one pass", () => {
    const store = makeStore({ items: [nearbyItem("item-wings-0", 900, 1000)] });
    store.spawn("pet-b", [
      { type: "Transform", position: { x: 420, y: 1000 } },
      { type: "Steering", mode: "stand" },
      { type: "MotionTarget", targetEntityId: null, targetPosition: null },
      { type: "WalkingTag" },
      { type: "CanWalk", force: 0.01 },
      {
        type: "Perception",
        userAnchor: null,
        nearbyPets: [],
        nearbyClimbables: [],
        nearbyItems: [nearbyItem("item-wings-0", 900, 1000)],
        self: { grounded: true, climbing: false, mode: "stand" },
      },
      {
        type: "Personality",
        openness: 0.7,
        conscientiousness: 0.4,
        extraversion: 0.6,
        agreeableness: 0.5,
        neuroticism: 0.05,
      },
    ]);

    runBehaviorDecisionSystem(store, createManualClock(0), constantRandom(0.5), BOUNDS);

    const fetchers = ["pet", "pet-b"].filter(
      (id) => store.getComponent(id, "BehaviorDecisionToken")?.kind === "fetch-item",
    );
    expect(fetchers).toEqual(["pet"]);
  });
});
