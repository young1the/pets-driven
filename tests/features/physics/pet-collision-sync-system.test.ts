import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { createManualClock } from "@/shared/time/manual-clock";
import { runPetCollisionSyncSystem } from "@/features/physics/systems";

describe("pet collision sync system", () => {
  it("projects active Matter.js dynamic collisions into PetCollision components", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [{ type: "Transform", position: { x: 100, y: 100 } }],
      },
      {
        id: "pet-b",
        components: [{ type: "Transform", position: { x: 130, y: 100 } }],
      },
    ]);
    const physics = {
      activeCollisions: () => [{ bodyAId: "pet-a", bodyBId: "pet-b" }],
    };

    runPetCollisionSyncSystem(store, physics, createManualClock(1200));

    expect(store.getComponent("pet-a", "PetCollision")).toEqual({
      type: "PetCollision",
      otherEntityId: "pet-b",
      otherPosition: { x: 130, y: 100 },
      startedAt: 1200,
      lastSeenAt: 1200,
    });
    expect(store.getComponent("pet-b", "PetCollision")).toMatchObject({
      otherEntityId: "pet-a",
      otherPosition: { x: 100, y: 100 },
    });
  });

  it("removes stale PetCollision components when Matter.js no longer reports the pair", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 100, y: 100 } },
          {
            type: "PetCollision",
            otherEntityId: "pet-b",
            otherPosition: { x: 130, y: 100 },
            startedAt: 1200,
            lastSeenAt: 1200,
          },
        ],
      },
    ]);
    const physics = { activeCollisions: () => [] };

    runPetCollisionSyncSystem(store, physics, createManualClock(1216));

    expect(store.getComponent("pet-a", "PetCollision")).toBeUndefined();
  });
});
