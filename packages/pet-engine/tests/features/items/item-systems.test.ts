import type { EntityDeclaration } from "@pets-driven/pet-engine/core/component-store";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createItemSpawner } from "@pets-driven/pet-engine/features/items/components";
import {
  desktopFloorSpans,
  dropRandomWorldItem,
  grantItemAbility,
  revokeItemAbility,
  runItemAbilityExpirySystem,
  runItemPickupSystem,
  runItemSpawnSystem,
  type WorldItemDropParams,
} from "@pets-driven/pet-engine/features/items/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };

/** A monitor floor slab, shaped like createMonitorBoundaryEntities builds one. */
function floor(id: string, x: number, y: number, width: number): EntityDeclaration {
  return {
    id,
    components: [
      { type: "Ground" },
      { type: "Transform", position: { x, y } },
      { type: "PhysicsBody", shape: "rectangle", width, height: 48 },
    ],
  };
}

function walker(id: string, x: number, y: number): EntityDeclaration {
  return {
    id,
    components: [
      { type: "PetIdentity", name: id },
      { type: "Transform", position: { x, y } },
      { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
      { type: "WalkingTag" },
      { type: "CanWalk", force: 0.01 },
    ],
  };
}

/** Records the gravity writes the systems make on the physics body. */
function gravitySpy() {
  const calls: Array<{ id: string; scale: number }> = [];
  return {
    calls,
    setGravityScale(id: string, scale: number) {
      calls.push({ id, scale });
    },
  };
}

describe("desktopFloorSpans", () => {
  it("keeps monitor floors and drops the ceilings above the viewport", () => {
    const store = createComponentStore([
      floor("monitor-ground", 960, 1104, 1920),
      // A ceiling sits entirely above the viewport's top edge.
      floor("monitor-ceiling", 960, -24, 1920),
      // A side wall is taller than it is wide.
      {
        id: "monitor-left-wall",
        components: [
          { type: "Ground" },
          { type: "Transform", position: { x: -24, y: 540 } },
          { type: "PhysicsBody", shape: "rectangle", width: 48, height: 1080 },
        ],
      },
    ]);

    const spans = desktopFloorSpans(store, BOUNDS);

    expect(spans).toEqual([{ minX: 64, maxX: 1856, topY: 1080 }]);
  });

  it("returns a span per monitor floor so multi-monitor drops land on both", () => {
    const store = createComponentStore([
      floor("left-ground", -640, 984, 1280),
      floor("primary-ground", 960, 1104, 1920),
    ]);

    const spans = desktopFloorSpans(store, { x: -1280, y: 0, width: 3200, height: 1080 });

    expect(spans.map((span) => span.topY)).toEqual([960, 1080]);
  });
});

describe("item spawn system", () => {
  it("drops a trinket onto the floor once the drop time arrives", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      floor("monitor-ground", 960, 1104, 1920),
      { id: "item-spawner", components: [createItemSpawner(0, { firstDropDelayMs: 1_000 })] },
    ]);
    const random = { next: () => 0.5 };

    runItemSpawnSystem(store, clock, random, BOUNDS);
    expect(store.query("WorldItem")).toHaveLength(0);

    clock.advanceBy(1_000);
    runItemSpawnSystem(store, clock, random, BOUNDS);

    const items = store.query("WorldItem", "Transform");
    expect(items).toHaveLength(1);
    // Rests on the floor's top surface, half its render height above it.
    expect(items[0].components[1].position.y).toBe(1080 - 16);
    expect(items[0].components[1].position.x).toBe(960);
  });

  it("holds off once the desktop already carries the maximum", () => {
    const clock = createManualClock(10_000);
    const store = createComponentStore([
      floor("monitor-ground", 960, 1104, 1920),
      {
        id: "item-spawner",
        components: [createItemSpawner(0, { nextDropAt: 0, maxOnScreen: 1 })],
      },
    ]);
    const random = { next: () => 0.5 };

    runItemSpawnSystem(store, clock, random, BOUNDS);
    runItemSpawnSystem(store, clock, random, BOUNDS);

    expect(store.query("WorldItem")).toHaveLength(1);
  });

  it("sweeps a trinket nobody collected before its lifetime is up", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      floor("monitor-ground", 960, 1104, 1920),
      {
        id: "item-spawner",
        components: [createItemSpawner(0, { nextDropAt: 0, itemLifetimeMs: 5_000 })],
      },
    ]);
    const random = { next: () => 0.5 };

    runItemSpawnSystem(store, clock, random, BOUNDS);
    expect(store.query("WorldItem")).toHaveLength(1);

    clock.advanceBy(5_000);
    runItemSpawnSystem(store, clock, random, BOUNDS);

    // The faded one is gone; whatever the spawner drops next is a fresh entity.
    expect(store.getEntity("item-wings-0") ?? store.getEntity("item-claws-0")).toBeUndefined();
  });

  it("never drops on its own once the cadence is switched off", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      floor("monitor-ground", 960, 1104, 1920),
      {
        id: "item-spawner",
        components: [createItemSpawner(0, { nextDropAt: Number.POSITIVE_INFINITY })],
      },
    ]);
    const random = { next: () => 0.5 };

    // However far the clock runs, the scheduled drop time never arrives.
    for (let tick = 0; tick < 10; tick += 1) {
      clock.advanceBy(60_000);
      runItemSpawnSystem(store, clock, random, BOUNDS);
    }

    expect(store.query("WorldItem")).toHaveLength(0);
  });
});

describe("dropRandomWorldItem", () => {
  const PARAMS: WorldItemDropParams = {
    kinds: ["wings"],
    itemLifetimeMs: 5_000,
    pickupRadius: 28,
  };

  it("places one trinket resting on a floor and returns its id", () => {
    const store = createComponentStore([floor("monitor-ground", 960, 1104, 1920)]);
    const random = { next: () => 0.5 };

    const id = dropRandomWorldItem(store, random, BOUNDS, 1_000, { ...PARAMS }, 7);

    expect(id).toBe("item-wings-7");
    const items = store.query("WorldItem", "Transform");
    expect(items).toHaveLength(1);
    expect(items[0].components[0].expiresAt).toBe(6_000);
    expect(items[0].components[1].position.y).toBe(1080 - 16);
    expect(items[0].components[1].position.x).toBe(960);
  });

  it("returns null when there is no floor to drop onto", () => {
    const store = createComponentStore([]);
    const random = { next: () => 0.5 };

    const id = dropRandomWorldItem(store, random, BOUNDS, 0, { ...PARAMS }, 0);

    expect(id).toBeNull();
    expect(store.query("WorldItem")).toHaveLength(0);
  });

  it("returns null when the kind pool is empty", () => {
    const store = createComponentStore([floor("monitor-ground", 960, 1104, 1920)]);
    const random = { next: () => 0.5 };

    const id = dropRandomWorldItem(store, random, BOUNDS, 0, { ...PARAMS, kinds: [] }, 0);

    expect(id).toBeNull();
    expect(store.query("WorldItem")).toHaveLength(0);
  });
});

describe("item pickup system", () => {
  it("turns a walker into a flier when it reaches a pair of wings", () => {
    const clock = createManualClock(1_000);
    const physics = gravitySpy();
    const store = createComponentStore([
      walker("pet-a", 400, 1060),
      {
        id: "item-spawner",
        components: [createItemSpawner(0, { abilityDurationMs: 30_000 })],
      },
      {
        id: "wings-1",
        components: [
          {
            type: "WorldItem",
            kind: "wings",
            droppedAt: 0,
            expiresAt: 90_000,
            pickupRadius: 28,
          },
          { type: "Transform", position: { x: 400, y: 1064 } },
        ],
      },
    ]);

    runItemPickupSystem(store, clock, physics);

    expect(store.getEntity("wings-1")).toBeUndefined();
    expect(store.getComponent("pet-a", "CanFly")).toEqual({
      type: "CanFly",
      gravityScale: 0,
      hoverStrength: 0,
    });
    expect(store.getComponent("pet-a", "FlyingTag")).toBeDefined();
    // WalkSystem and JumpSystem must stop fighting the flight systems.
    expect(store.getComponent("pet-a", "WalkingTag")).toBeUndefined();
    expect(physics.calls).toContainEqual({ id: "pet-a", scale: 0 });
    expect(store.getComponent("pet-a", "CarriedItem")).toMatchObject({
      kind: "wings",
      pickedUpAt: 1_000,
      expiresAt: 31_000,
    });
  });

  it("leaves a trinket the pet has not reached yet alone", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      walker("pet-a", 400, 1060),
      {
        id: "wings-1",
        components: [
          {
            type: "WorldItem",
            kind: "wings",
            droppedAt: 0,
            expiresAt: 90_000,
            pickupRadius: 28,
          },
          { type: "Transform", position: { x: 900, y: 1064 } },
        ],
      },
    ]);

    runItemPickupSystem(store, clock);

    expect(store.getEntity("wings-1")).toBeDefined();
    expect(store.getComponent("pet-a", "CarriedItem")).toBeUndefined();
  });

  it("gives one trinket to exactly one pet when two are standing on it", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      walker("pet-a", 400, 1060),
      walker("pet-b", 405, 1060),
      {
        id: "claws-1",
        components: [
          {
            type: "WorldItem",
            kind: "claws",
            droppedAt: 0,
            expiresAt: 90_000,
            pickupRadius: 28,
          },
          { type: "Transform", position: { x: 402, y: 1064 } },
        ],
      },
    ]);

    runItemPickupSystem(store, clock);

    const carriers = ["pet-a", "pet-b"].filter((id) => store.getComponent(id, "CarriedItem"));
    expect(carriers).toHaveLength(1);
  });

  it("trades the ability a pet is already wearing rather than stacking both", () => {
    const physics = gravitySpy();
    const store = createComponentStore([walker("pet-a", 400, 1060)]);

    grantItemAbility(store, physics, "pet-a", "wings", 0, 10_000);
    grantItemAbility(store, physics, "pet-a", "claws", 1_000, 10_000);

    expect(store.getComponent("pet-a", "CanFly")).toBeUndefined();
    expect(store.getComponent("pet-a", "FlyingTag")).toBeUndefined();
    expect(store.getComponent("pet-a", "CanWallClimb")).toBeDefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "CarriedItem")?.kind).toBe("claws");
  });
});

describe("item ability expiry system", () => {
  it("puts a flier back on the ground and restores its gravity", () => {
    const clock = createManualClock(0);
    const physics = gravitySpy();
    const store = createComponentStore([walker("pet-a", 400, 1060)]);

    grantItemAbility(store, physics, "pet-a", "wings", 0, 5_000);
    clock.advanceBy(5_000);
    runItemAbilityExpirySystem(store, clock, physics);

    expect(store.getComponent("pet-a", "CanFly")).toBeUndefined();
    expect(store.getComponent("pet-a", "FlyingTag")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "CarriedItem")).toBeUndefined();
    // Nothing else resets gravity once CanFly is gone — without this the pet
    // hangs in the air for the rest of the session.
    expect(physics.calls.at(-1)).toEqual({ id: "pet-a", scale: 1 });
  });

  it("keeps the ability while it is still running", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([walker("pet-a", 400, 1060)]);

    grantItemAbility(store, undefined, "pet-a", "wings", 0, 5_000);
    clock.advanceBy(4_999);
    runItemAbilityExpirySystem(store, clock);

    expect(store.getComponent("pet-a", "FlyingTag")).toBeDefined();
  });

  it("leaves a pet that cannot walk in the air rather than stranding it", () => {
    const physics = gravitySpy();
    // A native flier: no CanWalk, so there is no walking to come back to.
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "PetIdentity", name: "Gwen" },
          { type: "Transform", position: { x: 400, y: 400 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
          { type: "FlyingTag" },
          { type: "CanFly", gravityScale: 0, hoverStrength: 0 },
        ],
      },
    ]);

    grantItemAbility(store, physics, "pet-a", "wings", 0, 5_000);
    revokeItemAbility(store, physics, "pet-a", "wings");

    // Losing FlyingTag with no WalkingTag to replace it leaves no force system
    // owning the body at all — the pet would sink and never move again.
    expect(store.getComponent("pet-a", "FlyingTag")).toBeDefined();
    expect(store.getComponent("pet-a", "CanFly")).toBeDefined();
    expect(physics.calls).not.toContainEqual({ id: "pet-a", scale: 1 });
  });

  it("tears down a climb in progress when the claws wear off", () => {
    const store = createComponentStore([walker("pet-a", 120, 600)]);

    grantItemAbility(store, undefined, "pet-a", "claws", 0, 5_000);
    store.setComponent("pet-a", { type: "ClimbingTag" });
    store.setComponent("pet-a", {
      type: "ClimbIntentState",
      phase: "attached",
      surfaceEntityId: "wall",
      targetY: 200,
    });

    revokeItemAbility(store, undefined, "pet-a", "claws");

    // Every climb system bails on a missing CanWallClimb, so a leftover
    // ClimbingTag would strand the pet on the wall for good.
    expect(store.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
    expect(store.getComponent("pet-a", "ClimbIntentState")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeDefined();
  });
});
