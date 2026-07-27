import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runCollisionBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/collision-systems";
import { runBehaviorDecisionSystem } from "@pets-driven/pet-engine/features/behavior/decision-system";
import { runBehaviorPlanningSystem } from "@pets-driven/pet-engine/features/behavior/planning-system";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };

function makeWorkingPet(catalogId: PetPersonalityId) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentTaskState", status: "working", since: 0 },
        {
          type: "Personality",
          catalogId,
          openness: 0.5,
          conscientiousness: 0.5,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.3,
        },
        { type: "Steering", mode: "stand" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "Transform", position: { x: 500, y: 500 } },
        { type: "PhysicsBody", width: 32, height: 48, shape: "rectangle" },
      ],
    },
  ]);
}

describe("working behavior in the general decision pipeline", () => {
  it("emits an ordinary decision token and materializes it through planning", () => {
    const store = makeWorkingPet("steady");

    runBehaviorDecisionSystem(store, createManualClock(100), createSeededRandom(7), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toMatch(/^work-/);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.source).toBe("autonomous");

    runBehaviorPlanningSystem(store, createManualClock(100));
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("uses real locomotion only when the selected behavior is work-pace", () => {
    const store = makeWorkingPet("mischievous");
    let seed = 1;

    while (seed < 1_000) {
      store.removeComponent("pet", "BehaviorDecisionState");
      store.removeComponent("pet", "BehaviorDecisionToken");
      runBehaviorDecisionSystem(store, createManualClock(100), createSeededRandom(seed), BOUNDS);
      if (store.getComponent("pet", "BehaviorDecisionToken")?.kind === "work-pace") break;
      seed += 1;
    }

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("work-pace");
    runBehaviorPlanningSystem(store, createManualClock(100));
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).not.toBeNull();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
  });

  /**
   * BehaviorDecisionSystem only re-decides for a pet that is standing with no
   * motion target, so any system that clears a working pet's target must leave
   * its steering coherent. Leaving a travel mode behind stranded the pet
   * "pursuing nothing": it held its first work decision for the entire task and
   * never picked another behavior.
   */
  it("stays re-decidable after a collision interrupts its work", () => {
    const store = makeWorkingPet("playful");
    store.spawn("other", [
      { type: "Transform", position: { x: 508, y: 500 } },
      { type: "PhysicsBody", width: 32, height: 48, shape: "rectangle" },
      { type: "Steering", mode: "stand" },
      { type: "MotionTarget", targetEntityId: null, targetPosition: null },
    ]);
    store.setComponent("pet", { type: "Steering", mode: "pursue" });
    store.setComponent("pet", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 560, y: 500 },
    });

    runCollisionBehaviorSystem(store, BOUNDS, createManualClock(500));

    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");

    runBehaviorDecisionSystem(store, createManualClock(600), createSeededRandom(3), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toMatch(/^work-/);
  });

  it("makes a restless personality pace more often than a steady one", () => {
    const countPace = (catalogId: PetPersonalityId) => {
      let count = 0;
      for (let seed = 1; seed <= 200; seed += 1) {
        const store = makeWorkingPet(catalogId);
        runBehaviorDecisionSystem(store, createManualClock(100), createSeededRandom(seed), BOUNDS);
        if (store.getComponent("pet", "BehaviorDecisionToken")?.kind === "work-pace") count += 1;
      }
      return count;
    };

    expect(countPace("mischievous")).toBeGreaterThan(countPace("steady"));
  });
});
