import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  COURSE_LANE_BACK,
  COURSE_LANE_FORWARD,
  COURSE_REAP_BEHIND,
  COURSE_SCROLL_SPEED,
  COURSE_SPAWN_AHEAD,
  COURSE_SPAWN_INTERVAL_MS,
  GAME_HANG_GRAVITY_SCALE,
  GAME_SESSION_ENTITY_ID,
  GAME_STUMBLE_MS,
  GAME_STUMBLE_UNTIL_SWEPT,
  HURDLE_SIZE,
  MAX_LIVE_OBSTACLES,
  OBSTACLE_CLIP_RATIO,
  PET_CLIP_WIDTH_RATIO,
  PRACTICE_OBSTACLE_KINDS,
} from "@pets-driven/pet-engine/features/game/components";
import {
  runGameCourseSystem,
  runGameSpawnSystem,
  spawnObstacle,
  sweepCourse,
} from "@pets-driven/pet-engine/features/game/systems";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it, vi } from "vitest";

const PET_X = 500;
const PET_Y = 400;
const PET_BODY = { width: 32, height: 38 };
const PET_HEIGHT = PET_BODY.height;

function createStore(sessionOverrides?: Record<string, unknown>) {
  return createComponentStore([
    {
      id: GAME_SESSION_ENTITY_ID,
      components: [
        {
          type: "GameSession",
          petId: "pet-a",
          control: "pet",
          spawn: "auto",
          phase: "running",
          countdownMs: 0,
          score: 0,
          cleared: 0,
          startedAt: 0,
          anchorX: PET_X,
          lastPulseAt: 0,
          endedAt: 0,
          ...sessionOverrides,
        },
      ],
    },
    {
      id: "pet-a",
      components: [
        { type: "PetIdentity", name: "Scout" },
        { type: "Transform", position: { x: PET_X, y: PET_Y } },
        { type: "PhysicsBody", shape: "rectangle", ...PET_BODY },
      ],
    },
  ]);
}

/**
 * A course draws its next hurdle from the practice bag, so the spawner needs a
 * random source. Seeded, like everything else in this engine: the simulation is
 * headless and has to run the same way twice.
 */
function createRandom() {
  return createSeededRandom(7);
}

function createPhysics() {
  return {
    addRectangle: vi.fn(),
    setVelocity: vi.fn(),
    setGravityScale: vi.fn(),
    removeBody: vi.fn(),
  };
}

function session(components: ReturnType<typeof createStore>) {
  return components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
}

function obstacles(components: ReturnType<typeof createStore>) {
  return components.query("GameObstacle");
}

describe("laying out the course", () => {
  it("puts a hurdle ahead of the pet, standing on the pet's own floor", () => {
    const components = createStore();
    const physics = createPhysics();

    const id = spawnObstacle(components, physics, "pet-a", 0) as string;

    const transform = components.getComponent(id, "Transform");
    expect(transform?.position.x).toBe(PET_X + COURSE_SPAWN_AHEAD);
    // The pet's centre sits half its body above the floor, so the hurdle's
    // centre sits half of its own body above that same line.
    expect(transform?.position.y).toBe(PET_Y + PET_HEIGHT / 2 - HURDLE_SIZE.height / 2);
    // Registered with physics too, or it would hang in the air with no body.
    expect(physics.addRectangle).toHaveBeenCalledTimes(1);
  });

  it("is a prop, but never a toy", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;

    // It gets the prop machinery — a body, a floor, the window the host draws
    // props in — and PropKickSystem skips it on this marker.
    expect(components.getComponent(id, "WorldProp")?.kind).toBe("hurdle");
    expect(components.getComponent(id, "GameObstacle")).toBeTruthy();
    // No CanDrag: a hurdle the user can throw stops being where the course put it.
    expect(components.getComponent(id, "CanDrag")).toBeUndefined();
  });

  it("spaces the auto rhythm out, rather than one a tick", () => {
    const components = createStore();
    const physics = createPhysics();
    const clock = createManualClock(0);

    runGameSpawnSystem({ components, physics, clock, stilled: false, random: createRandom() });
    expect(obstacles(components)).toHaveLength(1);

    clock.advanceBy(COURSE_SPAWN_INTERVAL_MS - 100);
    runGameSpawnSystem({ components, physics, clock, stilled: false, random: createRandom() });
    expect(obstacles(components)).toHaveLength(1);

    clock.advanceBy(200);
    runGameSpawnSystem({ components, physics, clock, stilled: false, random: createRandom() });
    expect(obstacles(components)).toHaveLength(2);
  });

  it("draws each hurdle from the practice bag", () => {
    const components = createStore();
    const physics = createPhysics();
    const clock = createManualClock(0);
    const random = createRandom();
    const laid = new Set<string>();

    // Sweeps between spawns so the cap never gets in the way — this is about
    // what the bag deals, not about how many are alive.
    for (let i = 0; i < 40; i += 1) {
      runGameSpawnSystem({ components, physics, clock, stilled: false, random });
      for (const entry of components.query("GameObstacle", "WorldProp")) {
        laid.add(entry.components[1].kind);
        components.destroy(entry.id);
      }
      clock.advanceBy(COURSE_SPAWN_INTERVAL_MS);
    }

    expect(laid).toEqual(new Set(PRACTICE_OBSTACLE_KINDS));
  });

  it("stops at the cap, however long the round runs", () => {
    const components = createStore();
    const physics = createPhysics();
    const clock = createManualClock(0);

    for (let i = 0; i < MAX_LIVE_OBSTACLES + 4; i += 1) {
      runGameSpawnSystem({ components, physics, clock, stilled: false, random: createRandom() });
      clock.advanceBy(COURSE_SPAWN_INTERVAL_MS);
    }

    // Every one of these is a real always-on-top window in window-per-pet mode.
    expect(obstacles(components).length).toBeLessThanOrEqual(MAX_LIVE_OBSTACLES);
  });

  it("lays nothing while the round is still counting in", () => {
    const components = createStore({ phase: "countdown" });

    runGameSpawnSystem({
      components,
      physics: createPhysics(),
      clock: createManualClock(0),
      stilled: false,
      random: createRandom(),
    });

    expect(obstacles(components)).toHaveLength(0);
  });

  it("lays nothing for a tool-use round, which spawns off the agent instead", () => {
    const components = createStore({ spawn: "tool-use" });

    runGameSpawnSystem({
      components,
      physics: createPhysics(),
      clock: createManualClock(0),
      stilled: false,
      random: createRandom(),
    });

    expect(obstacles(components)).toHaveLength(0);
  });

  it("lays nothing while the world is stilled", () => {
    const components = createStore();

    runGameSpawnSystem({
      components,
      physics: createPhysics(),
      clock: createManualClock(0),
      stilled: true,
      random: createRandom(),
    });

    expect(obstacles(components)).toHaveLength(0);
  });
});

describe("the course coming at the pet", () => {
  it("pins each obstacle's speed, leaving the vertical to gravity", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // Only x: gravity keeps a hurdle standing on whatever floor is under it.
    expect(physics.setVelocity).toHaveBeenCalledWith(id, { x: -COURSE_SCROLL_SPEED });
  });

  it("holds the course still until the countdown is done", () => {
    const components = createStore({ phase: "countdown" });
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(physics.setVelocity).toHaveBeenCalledWith(id, { x: 0 });
  });

  it("holds the course still while the world is stilled", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, true);

    expect(physics.setVelocity).toHaveBeenCalledWith(id, { x: 0 });
    expect(session(components)?.score).toBe(0);
  });

  it("counts distance while the round runs", () => {
    const components = createStore();

    runGameCourseSystem(components, createPhysics(), 16, false);
    runGameCourseSystem(components, createPhysics(), 16, false);

    expect(session(components)?.score).toBeCloseTo(COURSE_SCROLL_SPEED * 2, 5);
  });

  it("marks an obstacle cleared once the pet is past it", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position.x = PET_X - 10;

    runGameCourseSystem(components, createPhysics(), 16, false);

    expect(components.getComponent(id, "GameObstacle")?.cleared).toBe(true);
  });

  it("sweeps an obstacle away once it is well behind the pet", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position.x = PET_X - COURSE_REAP_BEHIND - 1;
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // Nothing sweeps a prop, so the course has to take its own scenery back —
    // and the body with the window, or Matter goes on simulating a rectangle
    // nobody can see.
    expect(components.getEntity(id)).toBeUndefined();
    expect(physics.removeBody).toHaveBeenCalledWith(id);
  });

  it("sweeps a course whose round was stopped outright", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    // What world.endGame() leaves behind: a session naming nobody, and scenery
    // standing on the desktop with nothing running that would take it away.
    const stopped = session(components);
    if (stopped) {
      stopped.petId = null;
      stopped.phase = "over";
    }
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(components.getEntity(id)).toBeUndefined();
    expect(physics.removeBody).toHaveBeenCalledWith(id);
  });
});

describe("the pet holding its ground", () => {
  it("pins the pet's horizontal while the round runs", () => {
    const components = createStore();
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // The pet runs in place and the course moves. This is the last word on its
    // horizontal — a user leaning on a direction key would otherwise walk the
    // pet off its own course, and the pilot would have the same power.
    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0 });
  });

  it("leaves the vertical alone, which is the whole game", () => {
    const components = createStore();
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    const petCalls = physics.setVelocity.mock.calls.filter(([id]) => id === "pet-a");
    for (const [, velocity] of petCalls) {
      expect(velocity).not.toHaveProperty("y");
    }
  });

  it("lets the pet go once the round is over", () => {
    const components = createStore({ phase: "over" });
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    const petCalls = physics.setVelocity.mock.calls.filter(([id]) => id === "pet-a");
    expect(petCalls).toHaveLength(0);
  });
});

describe("the pet's lane", () => {
  function steeredStore(petX: number, pressing: number) {
    const components = createStore({ control: "user" });
    const transform = components.getComponent("pet-a", "Transform");
    if (transform) transform.position.x = petX;
    components.spawn("user-interaction", [
      { type: "KeyboardInputState", pressedCodes: [], vector: { x: pressing, y: 0 } },
    ]);
    return components;
  }

  function petVelocityCalls(physics: ReturnType<typeof createPhysics>) {
    return physics.setVelocity.mock.calls.filter(([id]) => id === "pet-a");
  }

  it("leaves a steered pet alone inside the lane", () => {
    const components = steeredStore(PET_X + 40, 1);
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // Moving is the round's second verb — close on a hurdle to jump it late,
    // back off to take it early. The course only minds the edges.
    expect(petVelocityCalls(physics)).toHaveLength(0);
  });

  it("stops a steered pet pressing past the front of its lane", () => {
    const components = steeredStore(PET_X + COURSE_LANE_FORWARD + 5, 1);
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0 });
  });

  it("still lets it come back from that edge", () => {
    const components = steeredStore(PET_X + COURSE_LANE_FORWARD + 5, -1);
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // One-directional, or the pet sticks to the boundary it reached: zeroing
    // outright would cancel the very press trying to bring it back.
    expect(petVelocityCalls(physics)).toHaveLength(0);
  });

  it("stops a steered pet backing out of its lane", () => {
    const components = steeredStore(PET_X - COURSE_LANE_BACK - 5, -1);
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0 });
  });

  it("holds a pet nobody is driving, which would otherwise wander off", () => {
    const components = createStore({ control: "pet" });
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0 });
  });
});

describe("clipping an obstacle", () => {
  function courseWithObstacleOnThePet(sessionOverrides?: Record<string, unknown>) {
    const components = createStore(sessionOverrides);
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    // Right on top of the pet: the two never collide in physics, so an overlap
    // is the only thing that says the pet failed to clear it.
    if (transform) transform.position = { x: PET_X, y: PET_Y };
    return { components, id };
  }

  it("puts the pet on the floor", () => {
    const { components } = courseWithObstacleOnThePet();

    expect(components.getComponent("pet-a", "GameStumble")).toBeUndefined();
    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    expect(components.getComponent("pet-a", "GameStumble")).toBeTruthy();
  });

  it("keeps the pet down for as long as the course that beat it is standing", () => {
    const { components } = courseWithObstacleOnThePet({ spawn: "auto" });

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    // No deadline: a finished round keeps its last obstacle on screen because
    // the wreck is the report, and a pet that dusted itself off after 700ms
    // stood idling beside the cactus that had just ended its round.
    expect(components.getComponent("pet-a", "GameStumble")?.until).toBe(GAME_STUMBLE_UNTIL_SWEPT);
  });

  it("lets a pet up when the course is swept", () => {
    const { components } = courseWithObstacleOnThePet({ spawn: "auto" });
    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    sweepCourse(components, createPhysics());

    // The two leave together, which is the whole reason the deadline is the
    // sweep and not a copy of GAME_OVER_LINGER_MS.
    expect(components.getComponent("pet-a", "GameStumble")).toBeUndefined();
  });

  it("only trips a pet whose round carries on", () => {
    const { components } = courseWithObstacleOnThePet({ spawn: "tool-use" });

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    // A tool-use round is not a game to lose, so this one gets up by itself.
    expect(components.getComponent("pet-a", "GameStumble")?.until).toBe(1_000 + GAME_STUMBLE_MS);
  });

  it("costs the pet once, however long the two stay overlapped", () => {
    const { components, id } = courseWithObstacleOnThePet();

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);
    const first = components.getComponent("pet-a", "GameStumble")?.until;
    runGameCourseSystem(components, createPhysics(), 16, false, 1_200);

    expect(components.getComponent("pet-a", "GameStumble")?.until).toBe(first);
    expect(components.getComponent(id, "GameObstacle")?.cleared).toBe(true);
  });

  it("ends a practice round, because a score nothing can take away is not one", () => {
    const { components } = courseWithObstacleOnThePet({ spawn: "auto" });

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    expect(session(components)?.phase).toBe("over");
  });

  it("never ends a tool-use round, which is not a game to lose", () => {
    const { components } = courseWithObstacleOnThePet({ spawn: "tool-use" });

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    // Its length belongs to somebody else's agent. Knocking the user out of a
    // run because a tool call landed awkwardly punishes them for their build.
    expect(session(components)?.phase).toBe("running");
    expect(components.getComponent("pet-a", "GameStumble")).toBeTruthy();
  });

  it("lets the pet up when the stumble runs out", () => {
    const { components } = courseWithObstacleOnThePet({ spawn: "tool-use" });
    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000 + GAME_STUMBLE_MS);

    expect(components.getComponent("pet-a", "GameStumble")).toBeUndefined();
  });

  it("leaves a pet that cleared the obstacle alone", () => {
    const components = createStore();
    spawnObstacle(components, createPhysics(), "pet-a", 0);

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    // Spawned a course ahead of the pet, so nothing is touching anything.
    expect(components.getComponent("pet-a", "GameStumble")).toBeUndefined();
  });

  it("leaves daylight between the two rather than hitting on the boxes", () => {
    const { components, id } = courseWithObstacleOnThePet();
    const transform = components.getComponent(id, "Transform");
    // Inside the two physics boxes, outside both clip boxes: the gap a user
    // watches the hurdle pass through and is told they hit it.
    const daylight = PET_X + PET_BODY.width / 2 + HURDLE_SIZE.width / 2 - 6;
    if (transform) transform.position.x = daylight - 1;

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    expect(components.getComponent("pet-a", "GameStumble")).toBeUndefined();
  });

  it("still hits when the two are actually on top of each other", () => {
    const { components, id } = courseWithObstacleOnThePet();
    const transform = components.getComponent(id, "Transform");
    const contact =
      (PET_BODY.width * PET_CLIP_WIDTH_RATIO) / 2 + (HURDLE_SIZE.width * OBSTACLE_CLIP_RATIO) / 2;
    if (transform) transform.position.x = PET_X + contact - 1;

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    expect(components.getComponent("pet-a", "GameStumble")).toBeTruthy();
  });

  it("lets a pet that jumped high enough over", () => {
    const components = createStore();
    // Spawned rather than placed by hand, so its feet are on the pet's floor
    // line — which is the whole of what makes the height below the right one.
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position.x = PET_X;
    const petTransform = components.getComponent("pet-a", "Transform");
    // Both clip boxes stand on the floor, so what a jump has to beat is the
    // obstacle's clipped height and nothing else.
    if (petTransform)
      petTransform.position.y = PET_Y - HURDLE_SIZE.height * OBSTACLE_CLIP_RATIO - 1;

    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);

    expect(components.getComponent("pet-a", "GameStumble")).toBeUndefined();
  });
});

describe("the tally the pet wears", () => {
  it("counts an obstacle it put behind itself untouched", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position.x = PET_X - 30;

    runGameCourseSystem(components, createPhysics(), 16, false);

    expect(session(components)?.cleared).toBe(1);
  });

  it("counts it once, however long it takes to be swept", () => {
    const components = createStore();
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position.x = PET_X - 30;

    runGameCourseSystem(components, createPhysics(), 16, false);
    runGameCourseSystem(components, createPhysics(), 16, false);

    expect(session(components)?.cleared).toBe(1);
  });

  it("does not count one the pet walked into", () => {
    const components = createStore({ spawn: "tool-use" });
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0) as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position = { x: PET_X, y: PET_Y };

    // The clip claims `cleared` on contact, then the wreck slides on past.
    runGameCourseSystem(components, createPhysics(), 16, false, 1_000);
    if (transform) transform.position.x = PET_X - 30;
    runGameCourseSystem(components, createPhysics(), 16, false, 1_100);

    expect(session(components)?.cleared).toBe(0);
  });

  it("leaves a marker out of the tally", () => {
    const components = createStore({ spawn: "tool-use" });
    const id = spawnObstacle(components, createPhysics(), "pet-a", 0, "finish") as string;
    const transform = components.getComponent(id, "Transform");
    if (transform) transform.position.x = PET_X - 30;

    runGameCourseSystem(components, createPhysics(), 16, false);

    // A finish line is the round changing state, not something the pet got over.
    expect(session(components)?.cleared).toBe(0);
  });
});

describe("hanging in the air", () => {
  function jumpingStore(phase: "rising" | "falling" | "landingCooldown") {
    const components = createStore();
    components.setComponent("pet-a", { type: "JumpActionState", phase, cooldownMs: 0 });
    return components;
  }

  it("lightens gravity while the pet is off the floor mid-round", () => {
    const components = jumpingStore("rising");
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // A jump is mass-compensated and so rises the same height whatever size the
    // pet is drawn at; the obstacle has to cross the pet's width, which is not.
    // This is what buys the crossing enough time to happen.
    expect(physics.setGravityScale).toHaveBeenCalledWith("pet-a", GAME_HANG_GRAVITY_SCALE);
  });

  it("hands gravity back the moment the jump is done", () => {
    const components = jumpingStore("landingCooldown");
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(physics.setGravityScale).toHaveBeenCalledWith("pet-a", 1);
  });

  it("hands gravity back when the round stops", () => {
    const components = jumpingStore("rising");
    const overSession = session(components);
    if (overSession) overSession.phase = "countdown";
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    // Re-decided every tick rather than latched, so a round that ends mid-arc
    // cannot leave a pet at two thirds gravity for the rest of its life.
    expect(physics.setGravityScale).toHaveBeenCalledWith("pet-a", 1);
  });

  it("leaves a flying pet's gravity to the wings that gave it", () => {
    const components = jumpingStore("rising");
    components.setComponent("pet-a", { type: "CanFly", gravityScale: 0, hoverStrength: 1 });
    const physics = createPhysics();

    runGameCourseSystem(components, physics, 16, false);

    expect(physics.setGravityScale).not.toHaveBeenCalled();
  });
});
