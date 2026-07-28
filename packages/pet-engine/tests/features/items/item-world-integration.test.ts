import { createWorld } from "@pets-driven/pet-engine/core/create-world";
import { createMonitorBoundaryEntities } from "@pets-driven/pet-engine/core/monitor-geometry";
import {
  createDemoScenario,
  createFixturePet,
} from "@pets-driven/pet-engine/core/scenario-fixtures";
import { createItemSpawner } from "@pets-driven/pet-engine/features/items/components";
import { DEFAULT_PET_WALK_FORCE } from "@pets-driven/pet-engine/pets/constants/pet-body";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * The whole point of the feature, exercised through the registered pipeline
 * rather than one system at a time: an adopted-style pet is built as nothing
 * but a grounded walker, and a trinket is what turns it into something else.
 */

const MONITOR = { id: "monitor", x: 0, y: 0, width: 1920, height: 1080 };
const STEP_MS = 16;

function createWorldWithWalker(options?: { spawner?: boolean }) {
  const clock = createManualClock(0);
  const world = createWorld({
    width: MONITOR.width,
    height: MONITOR.height,
    viewport: MONITOR,
    monitors: [MONITOR],
    clock,
    entities: [
      ...createMonitorBoundaryEntities([MONITOR], 48),
      ...(options?.spawner
        ? [
            {
              id: "item-spawner",
              components: [createItemSpawner(0, { firstDropDelayMs: 1_000 })],
            },
          ]
        : []),
      createFixturePet({
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        x: 400,
        y: MONITOR.height - 40,
        components: [
          { type: "WalkingTag" },
          { type: "CanWalk", force: DEFAULT_PET_WALK_FORCE },
          { type: "WandersOnArrival", arrivalRadius: 16 },
        ],
      }),
    ],
  });

  return { clock, world };
}

function step(
  world: ReturnType<typeof createWorldWithWalker>["world"],
  clock: ReturnType<typeof createWorldWithWalker>["clock"],
  ticks: number,
) {
  for (let i = 0; i < ticks; i += 1) {
    clock.advanceBy(STEP_MS);
    world.step(STEP_MS);
  }
}

describe("trinkets in a live world", () => {
  it("starts every pet as a plain walker with no flight or climb of its own", () => {
    const { world } = createWorldWithWalker();

    expect(world.getComponent("pet-a", "CanFly")).toBeUndefined();
    expect(world.getComponent("pet-a", "CanWallClimb")).toBeUndefined();
    expect(world.getComponent("pet-a", "WalkingTag")).toBeDefined();
  });

  it("registers the spawner so trinkets appear on the floor and reach the snapshot", () => {
    const { clock, world } = createWorldWithWalker({ spawner: true });

    step(world, clock, Math.ceil(1_100 / STEP_MS));

    const items = world.snapshot().items ?? [];
    expect(items.length).toBeGreaterThan(0);
    // Resting on the monitor floor, not floating in the middle of the screen.
    expect(items[0].position.y).toBeCloseTo(MONITOR.height - 16, 0);
  });

  it("hand-drops a trinket onto the floor when the host asks, with no spawner cadence", () => {
    // The spawner is present but its cadence is off, exactly as the adopted
    // desktop scenario wires it: nothing drops on a timer.
    const clock = createManualClock(0);
    const world = createWorld({
      width: MONITOR.width,
      height: MONITOR.height,
      viewport: MONITOR,
      monitors: [MONITOR],
      clock,
      entities: [
        ...createMonitorBoundaryEntities([MONITOR], 48),
        {
          id: "item-spawner",
          components: [createItemSpawner(0, { nextDropAt: Number.POSITIVE_INFINITY })],
        },
      ],
    });

    step(world, clock, Math.ceil(30_000 / STEP_MS));
    expect(world.snapshot().items).toHaveLength(0);

    const id = world.dropRandomItem();
    expect(id).not.toBeNull();

    const items = world.snapshot().items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].position.y).toBeCloseTo(MONITOR.height - 16, 0);
  });

  it("hand-drops using the tuned defaults in a world that runs no spawner", () => {
    const { world } = createWorldWithWalker();

    const id = world.dropRandomItem();

    expect(id).not.toBeNull();
    expect(world.snapshot().items).toHaveLength(1);
  });

  it("makes a walker fly once it collects a pair of wings", () => {
    const { clock, world } = createWorldWithWalker();
    const petY = world.getComponent("pet-a", "Transform")!.position.y;

    world.addEntity({
      id: "item-wings-0",
      components: [
        {
          type: "WorldItem",
          kind: "wings",
          droppedAt: 0,
          expiresAt: 60_000,
          pickupRadius: 28,
        },
        { type: "Transform", position: { x: 400, y: petY } },
      ],
    });

    step(world, clock, 1);

    expect(world.getComponent("pet-a", "CanFly")).toBeDefined();
    expect(world.getComponent("pet-a", "FlyingTag")).toBeDefined();
    expect(world.snapshot().pets[0].locomotion).toBe("fly");
    expect(world.snapshot().pets[0].carrying?.kind).toBe("wings");
    expect(world.snapshot().items).toHaveLength(0);
  });

  it("leaves the pet a walker again once the wings wear off", () => {
    const { clock, world } = createWorldWithWalker();
    const petY = world.getComponent("pet-a", "Transform")!.position.y;

    world.addEntity({
      id: "item-wings-0",
      components: [
        {
          type: "WorldItem",
          kind: "wings",
          droppedAt: 0,
          expiresAt: 60_000,
          pickupRadius: 28,
        },
        { type: "Transform", position: { x: 400, y: petY } },
      ],
    });
    // No spawner in this world, so the ability runs for the tuned default.
    step(world, clock, 1);
    const expiresAt = world.getComponent("pet-a", "CarriedItem")!.expiresAt;
    step(world, clock, Math.ceil(expiresAt / STEP_MS) + 1);

    expect(world.getComponent("pet-a", "FlyingTag")).toBeUndefined();
    expect(world.getComponent("pet-a", "CanFly")).toBeUndefined();
    expect(world.getComponent("pet-a", "WalkingTag")).toBeDefined();
    expect(world.snapshot().pets[0].carrying).toBeNull();
  });

  /**
   * The loop end to end, on the scenario a developer actually watches: drop →
   * notice → walk over → collect. Every step of it is somewhere else's system,
   * so nothing below this level can tell you the chain still connects. The
   * simulation is seeded, so this is deterministic; a retune that stops pets
   * ever reaching a trinket should fail here rather than go unnoticed.
   */
  it("has pets in the playground find and collect trinkets on their own", () => {
    const { clock, world } = createDemoScenario();
    const collected: Array<{ petId: string; kind: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < 60_000 / STEP_MS; i += 1) {
      clock.advanceBy(STEP_MS);
      world.step(STEP_MS);
      for (const pet of world.snapshot().pets) {
        if (!pet.carrying) continue;
        const key = `${pet.id}:${pet.carrying.pickedUpAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ petId: pet.id, kind: pet.carrying.kind });
      }
    }

    expect(collected.length).toBeGreaterThan(0);
    // And the ability is the point: a collected pair of wings makes a pet that
    // was built as a walker actually fly.
    expect(collected.some((entry) => entry.kind === "wings")).toBe(true);
  });
});
