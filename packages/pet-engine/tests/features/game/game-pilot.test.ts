import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { Component } from "@pets-driven/pet-engine/core/components";
import {
  GAME_SESSION_ENTITY_ID,
  PILOT_IGNORE_BEHIND,
  PILOT_JUMP_DISTANCE,
} from "@pets-driven/pet-engine/features/game/components";
import { runGamePilotSystem } from "@pets-driven/pet-engine/features/game/systems";
import { describe, expect, it } from "vitest";

const PET_X = 500;
const PET_Y = 400;

function createStore(options?: {
  session?: Record<string, unknown>;
  obstacleAt?: number | null;
  pet?: Component[];
}) {
  const obstacleAt = options?.obstacleAt === undefined ? PET_X + 40 : options.obstacleAt;

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
          ...options?.session,
        },
      ],
    },
    {
      id: "pet-a",
      components: [
        { type: "PetIdentity", name: "Scout" },
        { type: "WalkingTag" },
        { type: "Transform", position: { x: PET_X, y: PET_Y } },
        ...(options?.pet ?? []),
      ],
    },
    ...(obstacleAt === null
      ? []
      : [
          {
            id: "game-obstacle-1",
            components: [
              { type: "GameObstacle" as const, spawnedAt: 0, cleared: false },
              { type: "Transform" as const, position: { x: obstacleAt, y: PET_Y } },
            ],
          },
        ]),
  ]);
}

function jumpPhase(components: ReturnType<typeof createStore>) {
  return components.getComponent("pet-a", "JumpActionState")?.phase;
}

describe("the pet flying its own round", () => {
  it("asks for a jump once an obstacle is close enough", () => {
    const components = createStore({ obstacleAt: PET_X + PILOT_JUMP_DISTANCE - 5 });

    runGamePilotSystem(components, false);

    // Only ever a request: grounded-ness, the impulse and the landing cooldown
    // stay JumpSystem's, exactly as they are for a keyboard jump.
    expect(jumpPhase(components)).toBe("requested");
  });

  it("waits while the obstacle is still far off", () => {
    const components = createStore({ obstacleAt: PET_X + PILOT_JUMP_DISTANCE + 40 });

    runGamePilotSystem(components, false);

    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("ignores an obstacle it has already passed", () => {
    const components = createStore({ obstacleAt: PET_X - PILOT_IGNORE_BEHIND - 5 });

    runGamePilotSystem(components, false);

    // Otherwise a hurdle on its way out triggers a second, pointless jump.
    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("stays out of the way while the user is driving", () => {
    const components = createStore({ session: { control: "user" }, obstacleAt: PET_X + 10 });

    runGamePilotSystem(components, false);

    // Two of them steering would fight over the same jump, and the point of
    // taking the controls is that they are yours.
    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("does not jump while it is picking itself up", () => {
    const components = createStore({
      obstacleAt: PET_X + 10,
      pet: [{ type: "GameStumble", until: 9_999 }],
    });

    runGamePilotSystem(components, false);

    // Asking now would queue a jump for the moment it stands up, which is not
    // where the obstacle will be by then.
    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("leaves a jump already in flight alone", () => {
    const components = createStore({
      obstacleAt: PET_X + 10,
      pet: [{ type: "JumpActionState", phase: "rising", cooldownMs: 0 }],
    });

    runGamePilotSystem(components, false);

    expect(jumpPhase(components)).toBe("rising");
  });

  it("does nothing before the round starts", () => {
    const components = createStore({
      session: { phase: "countdown" },
      obstacleAt: PET_X + 10,
    });

    runGamePilotSystem(components, false);

    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("does nothing while the world is stilled", () => {
    const components = createStore({ obstacleAt: PET_X + 10 });

    runGamePilotSystem(components, true);

    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("has nothing to do on an empty course", () => {
    const components = createStore({ obstacleAt: null });

    runGamePilotSystem(components, false);

    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });
});
