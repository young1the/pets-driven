import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { runPetCollisionSyncSystem } from "@pets-driven/pet-engine/features/physics/systems";

function pet(id: string, x: number, y = 100) {
  return {
    id,
    components: [
      { type: "Transform" as const, position: { x, y } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
      { type: "PetIdentity" as const, name: id },
    ],
  };
}

describe("pet collision sync system (geometric overlap)", () => {
  it("derives PetCollision from overlapping pet AABBs", () => {
    // Centers 30px apart with 32px-wide bodies: overlapping by 2px.
    const store = createComponentStore([pet("pet-a", 100), pet("pet-b", 130)]);

    runPetCollisionSyncSystem(store, createManualClock(1200));

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

  it("keeps startedAt stable while the same pair stays overlapped", () => {
    const store = createComponentStore([pet("pet-a", 100), pet("pet-b", 130)]);

    runPetCollisionSyncSystem(store, createManualClock(1200));
    runPetCollisionSyncSystem(store, createManualClock(1700));

    expect(store.getComponent("pet-a", "PetCollision")).toMatchObject({
      startedAt: 1200,
      lastSeenAt: 1700,
    });
  });

  it("removes PetCollision once the bodies separate", () => {
    const store = createComponentStore([pet("pet-a", 100), pet("pet-b", 130)]);

    runPetCollisionSyncSystem(store, createManualClock(1200));
    store.setComponent("pet-b", {
      type: "Transform",
      position: { x: 300, y: 100 },
    });
    runPetCollisionSyncSystem(store, createManualClock(1216));

    expect(store.getComponent("pet-a", "PetCollision")).toBeUndefined();
    expect(store.getComponent("pet-b", "PetCollision")).toBeUndefined();
  });

  it("ignores non-pet entities and picks the nearest overlapping pet", () => {
    const store = createComponentStore([
      pet("pet-a", 100),
      pet("pet-b", 126),
      pet("pet-c", 130),
      {
        id: "ground",
        components: [
          { type: "Transform" as const, position: { x: 100, y: 110 } },
          {
            type: "PhysicsBody" as const,
            shape: "rectangle" as const,
            width: 960,
            height: 24,
          },
        ],
      },
    ]);

    runPetCollisionSyncSystem(store, createManualClock(0));

    // Ground overlaps pet-a but has no PetIdentity — never a collision.
    expect(
      store.getComponent("pet-a", "PetCollision")?.otherEntityId,
    ).toBe("pet-b");
    expect(store.getComponent("ground", "PetCollision")).toBeUndefined();
  });

  it("pets stacked vertically apart do not register", () => {
    const store = createComponentStore([
      pet("pet-a", 100, 100),
      pet("pet-b", 100, 200),
    ]);

    runPetCollisionSyncSystem(store, createManualClock(0));

    expect(store.getComponent("pet-a", "PetCollision")).toBeUndefined();
  });
});
