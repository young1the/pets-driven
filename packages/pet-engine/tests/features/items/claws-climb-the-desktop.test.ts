import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { DEFAULT_ITEM_SPAWNER } from "@pets-driven/pet-engine/features/items/components";
import { DEFAULT_PET_CLIMB_VELOCITY } from "@pets-driven/pet-engine/pets/constants/pet-body";
import { describe, expect, it } from "vitest";

/**
 * The claws trinket's whole promise, on the world it actually ships against.
 *
 * `createDesktopClimbableSurfaces` exists so claws have something to use, and
 * the unit tests below it all passed — but nothing checked the one thing that
 * matters, that a pet in the *live desktop world* ever reaches a wall. It did
 * not: the columns sit at the middle of a monitor's height, ~460px above a pet
 * on the floor, and perception measured them in a straight line against a 400px
 * range. A pet standing against a column perceived no climbable at all, so the
 * `request-climb` candidate was never even considered and claws granted an
 * ability with nothing in reach.
 *
 * This runs the full chain — perceive → decide → walk over → attach → climb —
 * on a real 1080p monitor, because every layer of it passed on its own while
 * the feature was dead end to end.
 */

const MONITOR = { id: "monitor", x: 0, y: 0, width: 1920, height: 1080 };
const STEP_MS = 16;
// The desktop app's scaled body, not the engine default: body size decides how
// far above the floor the pet's centre sits, which is the distance at issue.
const DESKTOP_PET_BODY = { width: 156, height: 156 };

/**
 * Put claws on the pet the way the world does.
 *
 * `CarriedItem` is not decoration here. In the live desktop world a capability
 * only ever arrives through `grantItemAbility`, which always writes the record
 * alongside it — and the decision layer reads that record to know the pet is
 * spending a borrowed minute, so it stops offering it the ball. Granting the
 * bare capability the way this file used to describes a pet that cannot exist
 * on the desktop, and the difference is not cosmetic: without the record the
 * pet treats its one minute of climbing as ordinary idle time.
 */
function wearClaws(world: ReturnType<typeof settledDesktopPet>["world"], now: number) {
  world.setComponent("pet-a", {
    type: "CanWallClimb",
    velocity: DEFAULT_PET_CLIMB_VELOCITY,
  });
  world.setComponent("pet-a", {
    type: "CarriedItem",
    kind: "claws",
    pickedUpAt: now,
    expiresAt: now + DEFAULT_ITEM_SPAWNER.abilityDurationMs,
  });
}

function settledDesktopPet() {
  const scenario = createAdoptedPetsScenario(
    [{ id: "pet-a", sourceId: "agent-a", name: "Alice" }],
    { monitors: [MONITOR], petBodySize: DESKTOP_PET_BODY },
  );

  for (let i = 0; i < 120; i += 1) {
    scenario.clock.advanceBy(STEP_MS);
    scenario.world.step(STEP_MS);
  }

  return scenario;
}

describe("claws on the live desktop world", () => {
  it("puts a wall within reach of a pet standing on the floor", () => {
    const { world } = settledDesktopPet();

    expect(world.getComponent("pet-a", "Perception")?.nearbyClimbables.length).toBeGreaterThan(0);
  });

  it("carries a pet that earns claws up the side of the screen", () => {
    const { clock, world } = settledDesktopPet();
    const startY = world.getComponent("pet-a", "Transform")!.position.y;

    wearClaws(world, clock.now());

    let climbed = false;
    let highestY = startY;
    // One ability's worth of time: a climb the pet only manages after the
    // trinket has worn off is not a climb the user ever sees.
    for (let i = 0; i < 60_000 / STEP_MS; i += 1) {
      clock.advanceBy(STEP_MS);
      world.step(STEP_MS);
      climbed ||= !!world.getComponent("pet-a", "ClimbingTag");
      highestY = Math.min(highestY, world.getComponent("pet-a", "Transform")!.position.y);
    }

    expect(climbed).toBe(true);
    // Well up the screen, not a hop: the climb has to read as one from across
    // the room, which is the point of putting the columns at mid-height.
    expect(highestY).toBeLessThan(MONITOR.height / 2);
  });

  it("reaches a wall at the far edge of what it can perceive", () => {
    // Perception lets a pet claim a climb from most of a screen away, and the
    // approach has to be able to finish that walk. When the approach budget ran
    // from the start of the walk instead of from the pet's last step nearer,
    // anything past ~820px was claimed, walked at for six seconds, then
    // cancelled — so the pet read "Climbing" over and over without ever
    // touching a wall.
    const { clock, world } = createAdoptedPetsScenario(
      [{ id: "pet-a", sourceId: "agent-a", name: "Alice" }],
      {
        monitors: [MONITOR],
        petBodySize: DESKTOP_PET_BODY,
        // Just inside the perception range of the left column at x=120.
        spawnPoint: { x: 1_000, y: MONITOR.height - 100 },
      },
    );

    wearClaws(world, clock.now());

    let attached = false;
    for (let i = 0; i < 90_000 / STEP_MS && !attached; i += 1) {
      clock.advanceBy(STEP_MS);
      world.step(STEP_MS);
      attached ||= world.getComponent("pet-a", "ClimbIntentState")?.phase === "attached";
    }

    expect(attached).toBe(true);
  });

  it("stands the climb against the edge of the screen, not out in the desktop", () => {
    // The columns are placed one half-width in, which is as near the edge as a
    // body can physically get: the side walls sit outside the work area, so the
    // pet's own edge meets the screen's. A fixed inset instead put every pet —
    // half size by default — 120px inside, climbing a strip of empty desktop.
    const { world } = settledDesktopPet();
    const [leftColumn] = world.snapshot().climbableSurfaces;
    const body = world.getComponent("pet-a", "PhysicsBody");
    const halfWidth = body?.shape === "rectangle" ? body.width / 2 : 0;

    expect(leftColumn.position.x - MONITOR.x).toBeCloseTo(halfWidth, 0);
  });

  it("leaves a pet without claws on the floor", () => {
    // The columns are in every desktop world whether or not anything can use
    // them, so they must stay inert until a pet earns the ability.
    const { clock, world } = settledDesktopPet();
    const startY = world.getComponent("pet-a", "Transform")!.position.y;

    for (let i = 0; i < 20_000 / STEP_MS; i += 1) {
      clock.advanceBy(STEP_MS);
      world.step(STEP_MS);
      expect(world.getComponent("pet-a", "ClimbingTag")).toBeUndefined();
    }

    // Jumping is allowed to lift it a little; leaving the floor behind is not.
    expect(world.getComponent("pet-a", "Transform")!.position.y).toBeGreaterThan(
      startY - MONITOR.height / 4,
    );
  });
});
