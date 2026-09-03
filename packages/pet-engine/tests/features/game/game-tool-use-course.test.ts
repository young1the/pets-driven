import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component } from "@pets-driven/pet-engine/core/components";
import {
  COURSE_MIN_OBSTACLE_GAP,
  GAME_OVER_LINGER_MS,
  GAME_SESSION_ENTITY_ID,
} from "@pets-driven/pet-engine/features/game/components";
import {
  runGameCourseSystem,
  runGameToolUseSpawnSystem,
} from "@pets-driven/pet-engine/features/game/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it, vi } from "vitest";

const PET_X = 500;
const PET_Y = 400;

function createStore(options?: { session?: Record<string, unknown>; pet?: Component[] }) {
  return createComponentStore([
    {
      id: GAME_SESSION_ENTITY_ID,
      components: [
        {
          type: "GameSession",
          petId: "pet-a",
          control: "pet",
          spawn: "tool-use",
          phase: "running",
          countdownMs: 0,
          score: 0,
          cleared: 0,
          startedAt: 0,
          anchorX: PET_X,
          lastPulseAt: 0,
          endedAt: 0,
          ...options?.session,
        },
      ],
    },
    {
      id: "pet-a",
      components: [
        { type: "PetIdentity", name: "Scout" },
        { type: "Transform", position: { x: PET_X, y: PET_Y } },
        { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
        ...(options?.pet ?? []),
      ],
    },
  ]);
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

function kinds(components: ReturnType<typeof createStore>) {
  return components
    .query("GameObstacle", "WorldProp")
    .map((entry) => entry.components[1].kind)
    .sort();
}

function spawn(components: ReturnType<typeof createStore>, at: number) {
  runGameToolUseSpawnSystem({
    components,
    physics: createPhysics(),
    clock: createManualClock(at),
    stilled: false,
  });
}

describe("a course an agent lays", () => {
  it("turns each tool call into the shape of what the agent is doing", () => {
    const study = createStore({
      pet: [{ type: "AgentActivitySignal", activity: "study", at: 10 }],
    });
    const edit = createStore({ pet: [{ type: "AgentActivitySignal", activity: "edit", at: 10 }] });
    const run = createStore({ pet: [{ type: "AgentActivitySignal", activity: "run", at: 10 }] });

    spawn(study, 10);
    spawn(edit, 10);
    spawn(run, 10);

    expect(kinds(study)).toEqual(["book-stack"]);
    expect(kinds(edit)).toEqual(["toolbox"]);
    expect(kinds(run)).toEqual(["flame"]);
  });

  it("still lays something for a pulse that carried no activity", () => {
    const components = createStore({
      pet: [{ type: "AgentActivitySignal", activity: null, at: 10 }],
    });

    spawn(components, 10);

    // An adapter that reported nothing still moved the heartbeat: it is a tool
    // call either way, just an unlabelled one.
    expect(kinds(components)).toEqual(["hurdle"]);
  });

  it("lays one obstacle per pulse, not one per tick", () => {
    const components = createStore({
      pet: [{ type: "AgentActivitySignal", activity: "study", at: 10 }],
    });

    spawn(components, 10);
    spawn(components, 20);
    spawn(components, 30);

    expect(kinds(components)).toHaveLength(1);
  });

  it("lays another when the next pulse lands", () => {
    const components = createStore({
      pet: [{ type: "AgentActivitySignal", activity: "study", at: 10 }],
    });
    spawn(components, 10);

    const pulse = components.getComponent("pet-a", "AgentActivitySignal");
    if (pulse) pulse.at = 900;
    spawn(components, 900);

    expect(kinds(components)).toHaveLength(2);
  });

  it("keeps a clearable gap between two calls that landed together", () => {
    const components = createStore({
      pet: [{ type: "AgentActivitySignal", activity: "run", at: 10 }],
    });
    spawn(components, 10);
    const pulse = components.getComponent("pet-a", "AgentActivitySignal");
    if (pulse) pulse.at = 26;
    spawn(components, 26);

    // Both calls are on the course — a tool-use round that swallowed one would
    // stop being a reading of what the agent is doing — but the second entered
    // far enough behind the first that one jump per obstacle still clears both.
    // Two flames a few hundred milliseconds apart is the round even the pilot
    // used to lose.
    const positions = components
      .query("GameObstacle", "Transform")
      .map((entry) => entry.components[1].position.x)
      .sort((a, b) => a - b);
    expect(positions).toHaveLength(2);
    expect(positions[1] - positions[0]).toBeGreaterThanOrEqual(COURSE_MIN_OBSTACLE_GAP);
  });

  it("ignores whatever the agent did before the round started", () => {
    const components = createStore({
      session: { lastPulseAt: 500 },
      pet: [{ type: "AgentActivitySignal", activity: "study", at: 100 }],
    });

    spawn(components, 600);

    expect(kinds(components)).toHaveLength(0);
  });
});

describe("a round the agent stops", () => {
  it("blocks the course at a gate while the agent waits for the user", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "waiting", since: 0 }],
    });

    spawn(components, 100);

    // The game halting *is* the report: what is on screen and what the user has
    // to do are the same thing rather than competing for attention.
    expect(session(components)?.phase).toBe("blocked");
    expect(kinds(components)).toEqual(["gate"]);
  });

  it("raises only one gate however long the wait lasts", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "waiting", since: 0 }],
    });

    spawn(components, 100);
    spawn(components, 200);
    spawn(components, 300);

    expect(kinds(components)).toEqual(["gate"]);
  });

  it("sweeps the gate and runs on when the agent moves again", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "waiting", since: 0 }],
    });
    spawn(components, 100);

    const task = components.getComponent("pet-a", "AgentTaskState");
    if (task) task.status = "working";
    spawn(components, 200);

    expect(session(components)?.phase).toBe("running");
    expect(kinds(components)).toHaveLength(0);
  });

  it("plants a finish line when the task completes", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "completed", since: 0 }],
    });

    spawn(components, 100);

    expect(session(components)?.phase).toBe("over");
    expect(kinds(components)).toEqual(["finish"]);
  });

  it("puts up a wall when the task fails", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "failed", since: 0 }],
    });

    spawn(components, 100);

    expect(session(components)?.phase).toBe("over");
    expect(kinds(components)).toEqual(["wall"]);
  });

  it("clears a standing gate before ending the round", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "waiting", since: 0 }],
    });
    spawn(components, 100);

    const task = components.getComponent("pet-a", "AgentTaskState");
    if (task) task.status = "completed";
    spawn(components, 200);

    expect(kinds(components)).toEqual(["finish"]);
  });
});

describe("clearing up after a round", () => {
  it("keeps the last obstacle on screen long enough to be read", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "completed", since: 0 }],
    });
    spawn(components, 100);

    runGameCourseSystem(components, createPhysics(), 16, false, 100 + GAME_OVER_LINGER_MS - 100);

    expect(kinds(components)).toEqual(["finish"]);
    expect(session(components)?.petId).toBe("pet-a");
  });

  it("takes every obstacle window away once the beat is up", () => {
    const components = createStore({
      pet: [{ type: "AgentTaskState", status: "completed", since: 0 }],
    });
    spawn(components, 100);

    runGameCourseSystem(components, createPhysics(), 16, false, 100 + GAME_OVER_LINGER_MS);

    // Nothing else in the world sweeps a prop, so a round that did not clean up
    // would leave its scenery on the desktop for good.
    expect(kinds(components)).toHaveLength(0);
    expect(session(components)?.petId).toBeNull();
  });
});
