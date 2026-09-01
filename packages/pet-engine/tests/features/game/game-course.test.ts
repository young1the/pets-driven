import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  COURSE_LANE_BACK,
  COURSE_LANE_FORWARD,
  COURSE_REAP_BEHIND,
  COURSE_SCROLL_SPEED,
  COURSE_SPAWN_AHEAD,
  COURSE_SPAWN_INTERVAL_MS,
  GAME_SESSION_ENTITY_ID,
  HURDLE_SIZE,
  MAX_LIVE_OBSTACLES,
} from "@pets-driven/pet-engine/features/game/components";
import {
  runGameCourseSystem,
  runGameSpawnSystem,
  spawnObstacle,
} from "@pets-driven/pet-engine/features/game/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it, vi } from "vitest";

const PET_X = 500;
const PET_Y = 400;
const PET_HEIGHT = 38;

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
          startedAt: 0,
          anchorX: PET_X,
          ...sessionOverrides,
        },
      ],
    },
    {
      id: "pet-a",
      components: [
        { type: "PetIdentity", name: "Scout" },
        { type: "Transform", position: { x: PET_X, y: PET_Y } },
        { type: "PhysicsBody", shape: "rectangle", width: 32, height: PET_HEIGHT },
      ],
    },
  ]);
}

function createPhysics() {
  return { addRectangle: vi.fn(), setVelocity: vi.fn() };
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

    runGameSpawnSystem({ components, physics, clock, stilled: false });
    expect(obstacles(components)).toHaveLength(1);

    clock.advanceBy(COURSE_SPAWN_INTERVAL_MS - 100);
    runGameSpawnSystem({ components, physics, clock, stilled: false });
    expect(obstacles(components)).toHaveLength(1);

    clock.advanceBy(200);
    runGameSpawnSystem({ components, physics, clock, stilled: false });
    expect(obstacles(components)).toHaveLength(2);
  });

  it("stops at the cap, however long the round runs", () => {
    const components = createStore();
    const physics = createPhysics();
    const clock = createManualClock(0);

    for (let i = 0; i < MAX_LIVE_OBSTACLES + 4; i += 1) {
      runGameSpawnSystem({ components, physics, clock, stilled: false });
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

    runGameCourseSystem(components, createPhysics(), 16, false);

    // Nothing sweeps a prop, so the course has to take its own scenery back.
    expect(components.getEntity(id)).toBeUndefined();
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
