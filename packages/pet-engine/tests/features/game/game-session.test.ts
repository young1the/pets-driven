import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import {
  GAME_COUNTDOWN_MS,
  GAME_SESSION_ENTITY_ID,
  gameCountdownGlyph,
} from "@pets-driven/pet-engine/features/game/components";
import { runGameSessionSystem } from "@pets-driven/pet-engine/features/game/systems";
import { describe, expect, it } from "vitest";

function createStore(overrides?: Partial<Record<string, unknown>>) {
  return createComponentStore([
    {
      id: GAME_SESSION_ENTITY_ID,
      components: [
        {
          type: "GameSession",
          petId: "pet-a",
          control: "pet",
          spawn: "tool-use",
          phase: "countdown",
          countdownMs: GAME_COUNTDOWN_MS,
          score: 0,
          cleared: 0,
          startedAt: 0,
          anchorX: 0,
          lastPulseAt: 0,
          endedAt: 0,
          ...overrides,
        },
      ],
    },
    { id: "pet-a", components: [{ type: "PetIdentity", name: "Scout" }] },
  ]);
}

function session(components: ReturnType<typeof createStore>) {
  return components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession");
}

describe("the opening countdown", () => {
  it("spends the countdown down to zero, then starts the round", () => {
    const components = createStore();

    runGameSessionSystem(components, 1_600, false);
    expect(session(components)?.phase).toBe("countdown");
    expect(session(components)?.countdownMs).toBe(1_400);

    runGameSessionSystem(components, 1_600, false);
    expect(session(components)?.phase).toBe("running");
    expect(session(components)?.countdownMs).toBe(0);
  });

  it("reads its glyph off the clock that ends it, so the two cannot drift", () => {
    // One glyph a second, and nothing left to show once the round is under way.
    expect(gameCountdownGlyph(GAME_COUNTDOWN_MS)).toBe("3️⃣");
    expect(gameCountdownGlyph(2_400)).toBe("3️⃣");
    expect(gameCountdownGlyph(1_800)).toBe("2️⃣");
    expect(gameCountdownGlyph(600)).toBe("1️⃣");
    expect(gameCountdownGlyph(0)).toBeNull();
  });

  it("freezes where it is while the world is stilled", () => {
    const components = createStore();

    runGameSessionSystem(components, 1_000, true);

    // Quiet Mode `still` means "hold where you are", not "forget what you were
    // doing" — turning it off resumes this round instead of cancelling it.
    expect(session(components)?.countdownMs).toBe(GAME_COUNTDOWN_MS);
    expect(session(components)?.phase).toBe("countdown");
  });
});

describe("a session whose pet is gone", () => {
  it("ends when the pet it named has left the world", () => {
    const components = createStore();
    components.destroy("pet-a");

    runGameSessionSystem(components, 16, false);

    expect(session(components)?.petId).toBeNull();
    expect(session(components)?.phase).toBe("over");
  });

  it("does nothing at all when no pet is on a course", () => {
    const components = createStore({ petId: null, phase: "over" });

    runGameSessionSystem(components, 16, false);

    expect(session(components)?.countdownMs).toBe(GAME_COUNTDOWN_MS);
    expect(session(components)?.phase).toBe("over");
  });
});

describe("the world's game API", () => {
  function scenario() {
    return createAdoptedPetsScenario([
      { id: "pet-a", sourceId: "agent-a", name: "Scout" },
      { id: "pet-b", sourceId: "agent-b", name: "Luna" },
    ]);
  }

  it("starts idle, with the session present and pointing at nobody", () => {
    const { world } = scenario();

    // Declared rather than spawned on demand: a host asking "is a game running"
    // must not have to tell a missing component apart from an idle one.
    expect(world.gamePetId()).toBeNull();
  });

  it("puts a pet on a course and shows it in that pet's snapshot alone", () => {
    const { world } = scenario();

    expect(world.startGame("pet-a")).toBe(true);

    const pets = world.snapshot().pets;
    expect(pets.find((pet) => pet.id === "pet-a")?.game).toMatchObject({
      phase: "countdown",
      control: "pet",
      spawn: "tool-use",
      countdown: "3️⃣",
    });
    expect(pets.find((pet) => pet.id === "pet-b")?.game).toBeUndefined();
  });

  it("moves the session rather than running two, since there is only one", () => {
    const { world } = scenario();

    world.startGame("pet-a");
    world.startGame("pet-b");

    expect(world.gamePetId()).toBe("pet-b");
    expect(world.snapshot().pets.find((pet) => pet.id === "pet-a")?.game).toBeUndefined();
  });

  it("refuses a pet that is not in the world", () => {
    const { world } = scenario();

    expect(world.startGame("pet-nobody")).toBe(false);
    expect(world.gamePetId()).toBeNull();
  });

  it("ends the session", () => {
    const { world } = scenario();

    world.startGame("pet-a");
    world.endGame();

    expect(world.gamePetId()).toBeNull();
    expect(world.snapshot().pets.find((pet) => pet.id === "pet-a")?.game).toBeUndefined();
  });
});

describe("who is driving", () => {
  function createStoreWithSteering(steeredId: string | null) {
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
            anchorX: 0,
            lastPulseAt: 0,
            endedAt: 0,
          },
        ],
      },
      {
        id: "user-interaction",
        components: [{ type: "KeyboardControlTarget", entityId: steeredId }],
      },
      { id: "pet-a", components: [{ type: "PetIdentity", name: "Scout" }] },
    ]);
  }

  function control(components: ReturnType<typeof createStoreWithSteering>) {
    return components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession")?.control;
  }

  it("follows the keyboard rather than keeping its own answer", () => {
    const components = createStoreWithSteering("pet-a");

    runGameSessionSystem(components, 16, false);

    // Taking the controls mid-round is just pressing on the pet — there is no
    // second control to set, so the two can never disagree.
    expect(control(components)).toBe("user");
  });

  it("hands the round back to the pet when the user lets go", () => {
    const components = createStoreWithSteering("pet-a");
    runGameSessionSystem(components, 16, false);

    const steering = components.getComponent("user-interaction", "KeyboardControlTarget");
    if (steering) steering.entityId = null;
    runGameSessionSystem(components, 16, false);

    // Escape ends the hold, not the round: the course carries on with the pet
    // driving itself.
    expect(control(components)).toBe("pet");
    expect(components.getComponent(GAME_SESSION_ENTITY_ID, "GameSession")?.phase).toBe("running");
  });

  it("does not count the user steering some other pet", () => {
    const components = createStoreWithSteering("pet-b");

    runGameSessionSystem(components, 16, false);

    expect(control(components)).toBe("pet");
  });
});
