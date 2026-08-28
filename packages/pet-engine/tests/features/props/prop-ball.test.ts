import { createWorld } from "@pets-driven/pet-engine/core/create-world";
import { createMonitorBoundaryEntities } from "@pets-driven/pet-engine/core/monitor-geometry";
import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { BALL_ENTITY_ID, BALL_RADIUS } from "@pets-driven/pet-engine/features/props/components";
import { createBallProp } from "@pets-driven/pet-engine/features/props/entities";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * The ball, on the world it ships against.
 *
 * The point of a prop is that almost none of its behavior is its own: it falls
 * because it has a PhysicsBody, it is throwable because it has CanDrag, and a
 * kick reaches the physics layer as a ThrowImpulse — the component the user's
 * own flick of the mouse writes. So these tests are mostly about whether the
 * borrowed machinery actually took, which is not something the unit tests of
 * any one slice can answer.
 */

const MONITOR = { id: "monitor", x: 0, y: 0, width: 1920, height: 1080 };
const STEP_MS = 16;

function ballWorld() {
  const clock = createManualClock(0);
  const world = createWorld({
    width: MONITOR.width,
    height: MONITOR.height,
    viewport: { x: 0, y: 0, width: MONITOR.width, height: MONITOR.height },
    monitors: [MONITOR],
    clock,
    // Dropped from mid-air, so "it fell" is a claim the test can actually make.
    entities: [...createMonitorBoundaryEntities([MONITOR], 48), createBallProp({ x: 400, y: 300 })],
  });
  return { clock, world };
}

function step(
  scenario: { clock: { advanceBy(ms: number): void }; world: { step(ms: number): void } },
  ticks: number,
) {
  for (let i = 0; i < ticks; i += 1) {
    scenario.clock.advanceBy(STEP_MS);
    scenario.world.step(STEP_MS);
  }
}

describe("the ball as a physics prop", () => {
  it("falls and comes to rest on the floor", () => {
    const scenario = ballWorld();
    step(scenario, 300);

    const position = scenario.world.getComponent(BALL_ENTITY_ID, "Transform")!.position;
    // The floor's walkable surface is the monitor's bottom edge.
    expect(position.y).toBeCloseTo(MONITOR.height - BALL_RADIUS, 0);
  });

  it("is reported in the snapshot with a radius and a rotation", () => {
    const scenario = ballWorld();
    step(scenario, 300);

    const [prop] = scenario.world.snapshot().props ?? [];
    expect(prop).toMatchObject({ id: BALL_ENTITY_ID, kind: "ball", radius: BALL_RADIUS });
    expect(typeof prop.angle).toBe("number");
  });

  it("takes a throw through the same ThrowImpulse path a pet does", () => {
    const scenario = ballWorld();
    step(scenario, 300);
    const startX = scenario.world.getComponent(BALL_ENTITY_ID, "Transform")!.position.x;

    scenario.world.setComponent(BALL_ENTITY_ID, {
      type: "ThrowImpulse",
      velocity: { x: 12, y: -6 },
    });
    step(scenario, 60);

    expect(scenario.world.getComponent(BALL_ENTITY_ID, "Transform")!.position.x).toBeGreaterThan(
      startX + 100,
    );
    // The impulse is consumed, not re-applied every tick.
    expect(scenario.world.getComponent(BALL_ENTITY_ID, "ThrowImpulse")).toBeUndefined();
  });

  it("rolls, so TravelState tells a moving ball from a resting one", () => {
    const scenario = ballWorld();
    step(scenario, 300);
    expect(
      Math.hypot(
        scenario.world.getComponent(BALL_ENTITY_ID, "TravelState")!.dx,
        scenario.world.getComponent(BALL_ENTITY_ID, "TravelState")!.dy,
      ),
    ).toBeLessThan(1);

    scenario.world.setComponent(BALL_ENTITY_ID, {
      type: "ThrowImpulse",
      velocity: { x: 12, y: 0 },
    });
    step(scenario, 3);

    expect(scenario.world.getComponent(BALL_ENTITY_ID, "TravelState")!.dx).toBeGreaterThan(1.5);
  });
});

describe("the ball on the adopted desktop", () => {
  /**
   * A desktop with one pet and one hand-placed ball.
   *
   * The scenario declares no props of its own — nothing sweeps a prop away, so
   * a ball the user never asked for would be a permanent object they had to go
   * and find the place dialog to be rid of. `spawnProp` is the only way one
   * arrives, so it is the way these tests get one too.
   */
  function desktopWithBall() {
    const scenario = createAdoptedPetsScenario(
      [{ id: "pet-a", sourceId: "agent-a", name: "Alice" }],
      { monitors: [MONITOR] },
    );
    step(scenario, 60);
    const ballId = scenario.world.spawnProp("ball") as string;
    return { ...scenario, ballId };
  }

  it("starts bare, so nothing lands on the desktop unasked", () => {
    const scenario = createAdoptedPetsScenario(
      [{ id: "pet-a", sourceId: "agent-a", name: "Alice" }],
      { monitors: [MONITOR] },
    );
    step(scenario, 60);

    expect(scenario.world.propIds()).toEqual([]);
    expect(scenario.world.getComponent("pet-a", "Perception")?.nearbyProps).toEqual([]);
  });

  it("is perceived by a pet across the desktop", () => {
    const scenario = desktopWithBall();
    // One tick for PerceptionSystem to see what spawnProp just put down.
    step(scenario, 1);

    const perceived = scenario.world.getComponent("pet-a", "Perception")?.nearbyProps ?? [];
    expect(perceived.map((entry) => entry.id)).toContain(scenario.ballId);
  });

  it("gets kicked across the desktop by a pet that goes over to it", () => {
    const scenario = desktopWithBall();
    const startX = scenario.world.getComponent(scenario.ballId, "Transform")!.position.x;

    let kicks = 0;
    let lastKickAt = 0;
    // A minute of ordinary life: the ball is an occasional treat, not the pet's
    // whole day, so this needs room to happen.
    for (let i = 0; i < 60_000 / STEP_MS; i += 1) {
      step(scenario, 1);
      const prop = scenario.world.getComponent(scenario.ballId, "WorldProp")!;
      if (prop.lastKickAt !== lastKickAt) {
        lastKickAt = prop.lastKickAt;
        kicks += 1;
      }
    }

    expect(kicks).toBeGreaterThan(0);
    expect(
      Math.abs(scenario.world.getComponent(scenario.ballId, "Transform")!.position.x - startX),
    ).toBeGreaterThan(100);
  });

  it("still leaves the pet time for the rest of its life", () => {
    // The regression this guards: priced like a trinket, a ball that is simply
    // always there won every decision and the pet did nothing else — no jumps,
    // no poses, no wandering. A ball is furniture, so it must lose to the
    // ordinary pool most of the time.
    const scenario = desktopWithBall();
    const reasons = new Set<string>();
    for (let i = 0; i < 60_000 / STEP_MS; i += 1) {
      step(scenario, 1);
      const reason = scenario.world.getComponent("pet-a", "BehaviorDecisionState")?.reason;
      if (reason) reasons.add(reason);
    }

    expect(reasons).toContain("chase-prop");
    expect([...reasons].filter((reason) => reason !== "chase-prop").length).toBeGreaterThan(3);
  });

  it("is ignored by a pet wearing a borrowed ability", () => {
    // Wings and claws last a minute, and that minute is the only one an
    // ordinary walker ever gets to fly or climb in. The ball will still be
    // there afterwards.
    const scenario = desktopWithBall();
    scenario.world.setComponent("pet-a", {
      type: "CarriedItem",
      kind: "claws",
      pickedUpAt: scenario.clock.now(),
      expiresAt: scenario.clock.now() + 60_000,
    });

    for (let i = 0; i < 60_000 / STEP_MS; i += 1) {
      step(scenario, 1);
      expect(scenario.world.getComponent("pet-a", "BehaviorDecisionState")?.reason).not.toBe(
        "chase-prop",
      );
    }
  });
});

describe("placing and clearing props by hand", () => {
  function desktop() {
    return createAdoptedPetsScenario([{ id: "pet-a", sourceId: "agent-a", name: "Alice" }], {
      monitors: [MONITOR],
    });
  }

  it("puts a new ball on a floor and gives it a body straight away", () => {
    const scenario = desktop();
    step(scenario, 60);

    const id = scenario.world.spawnProp("ball");
    expect(id).not.toBeNull();
    step(scenario, 120);

    const placed = scenario.world.snapshot().props?.find((prop) => prop.id === id);
    // It has a body, so it fell to the floor rather than hanging where it was
    // declared — which is the thing a spawn that skipped registerPhysicsBody
    // would silently get wrong.
    expect(placed?.position.y).toBeCloseTo(MONITOR.height - BALL_RADIUS, 0);
  });

  it("never reuses an id, so a cleared ball's overlay cannot be inherited", () => {
    const scenario = desktop();
    step(scenario, 60);

    const first = scenario.world.spawnProp("ball");
    scenario.world.removeEntity(first as string);
    const second = scenario.world.spawnProp("ball");

    expect(second).not.toBe(first);
  });

  it("reports every prop so a host can clear them, and clearing empties the world", () => {
    const scenario = desktop();
    step(scenario, 60);
    scenario.world.spawnProp("ball");
    scenario.world.spawnProp("ball");

    expect(scenario.world.propIds()).toHaveLength(2);

    for (const id of scenario.world.propIds()) {
      scenario.world.removeEntity(id);
    }
    step(scenario, 60);

    expect(scenario.world.propIds()).toEqual([]);
    expect(scenario.world.snapshot().props).toEqual([]);
  });

  it("refuses to place into a world with no floor", () => {
    const clock = createManualClock(0);
    const world = createWorld({
      width: MONITOR.width,
      height: MONITOR.height,
      clock,
      entities: [],
    });

    expect(world.spawnProp("ball")).toBeNull();
  });
});

describe("what a kick is worth", () => {
  const FLOOR_Y = MONITOR.height - BALL_RADIUS;

  /**
   * A ball, and one pet placed against it that only moves if the test moves it.
   * Built bare rather than from the adopted scenario because the thing under
   * test is what a pet's own speed is worth, and a wandering pet decides its
   * own speed.
   */
  function petAgainstBall(petX: number, ballX: number) {
    const clock = createManualClock(0);
    const world = createWorld({
      width: MONITOR.width,
      height: MONITOR.height,
      viewport: { x: 0, y: 0, width: MONITOR.width, height: MONITOR.height },
      monitors: [MONITOR],
      clock,
      entities: [
        ...createMonitorBoundaryEntities([MONITOR], 48),
        createBallProp({ x: ballX, y: FLOOR_Y }),
        {
          id: "pet-a",
          components: [
            { type: "PetIdentity", name: "Alice" },
            { type: "Transform", position: { x: petX, y: MONITOR.height - 40 } },
            { type: "PhysicsBody", shape: "rectangle", width: 78, height: 78 },
          ],
        },
      ],
    });
    return { clock, world };
  }

  /** How fast the ball is travelling, one tick after it was last touched. */
  function kicksIn(scenario: ReturnType<typeof petAgainstBall>, ticks: number) {
    const speeds: number[] = [];
    let lastKickAt = 0;
    let sampleIn = -1;
    for (let i = 0; i < ticks; i += 1) {
      step(scenario, 1);
      if (sampleIn === 0) {
        speeds.push(Math.abs(scenario.world.getComponent(BALL_ENTITY_ID, "TravelState")?.dx ?? 0));
      }
      if (sampleIn >= 0) sampleIn -= 1;
      const prop = scenario.world.getComponent(BALL_ENTITY_ID, "WorldProp")!;
      if (prop.lastKickAt !== lastKickAt) {
        lastKickAt = prop.lastKickAt;
        sampleIn = 1;
      }
    }
    return speeds;
  }

  it("leaves the ball alone when the pet is standing still", () => {
    // The reported bug: a ball wedged between a wall and a motionless pet was
    // kicked into the wall every cooldown, bounced back, and was kicked again —
    // forever. Contact is not a kick; running into something is.
    const scenario = petAgainstBall(MONITOR.width - 120, MONITOR.width - 70);
    step(scenario, 30);

    expect(kicksIn(scenario, 60_000 / STEP_MS)).toEqual([]);
  });

  it("kicks harder the faster the pet runs into it", () => {
    /** Walk the pet rightward at a fixed speed and report the ball's best. */
    function walkInto(petSpeed: number) {
      const scenario = petAgainstBall(600, 700);
      step(scenario, 5);
      let fastest = 0;
      for (let i = 0; i < 90; i += 1) {
        const transform = scenario.world.getComponent("pet-a", "Transform")!;
        scenario.world.setPhysicsPosition("pet-a", { x: transform.position.x + petSpeed });
        step(scenario, 1);
        fastest = Math.max(
          fastest,
          Math.abs(scenario.world.getComponent(BALL_ENTITY_ID, "TravelState")?.dx ?? 0),
        );
      }
      return fastest;
    }

    const slow = walkInto(1);
    const fast = walkInto(3);

    expect(slow).toBeGreaterThan(0);
    // The point of the change: the ball leaves at a speed the pet's own pace
    // decides, not at a constant that buried it.
    expect(fast).toBeGreaterThan(slow * 1.5);
  });
});
