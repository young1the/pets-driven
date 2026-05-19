import { describe, expect, it } from "vitest";
import type { PetIntent } from "@/core/components/simulation-components";
import { runIntentSteeringSystem } from "@/core/systems/intent-steering-system";

const SLOW_RADIUS = 96;

function createSteeringPet(intent: PetIntent, speed: number) {
  return {
    id: intent,
    position: { x: 0, y: 0 },
    movement: {
      type: "MovementProfile" as const,
      idleSpeed: intent === "idle" ? speed : 0,
      activeSpeed: intent === "active" ? speed : 0,
      seekSpeed: intent === "seek" ? speed : 0,
    },
    intent: {
      type: "IntentState" as const,
      intent,
    },
    motion: {
      type: "MotionTarget" as const,
      targetEntityId: null,
      targetPosition: { x: SLOW_RADIUS * 2, y: 0 },
    },
    navigation: {
      type: "NavigationState" as const,
      avoidanceWaypoint: null as { x: number; y: number } | null,
    },
  };
}

describe("intent steering system", () => {
  it("uses different movement speeds by intent", () => {
    const forces = runIntentSteeringSystem([
      createSteeringPet("idle", 0.0006),
      createSteeringPet("active", 0.0012),
      createSteeringPet("seek", 0.0018),
    ]);

    expect(forces.map((force) => force.x)).toEqual([0.0006, 0.0012, 0.0018]);
  });

  it("stops steering once a pet reaches its arrival radius", () => {
    const pet = createSteeringPet("seek", 0.0018);
    pet.position = { x: 0, y: 0 };
    pet.motion.targetPosition = { x: 8, y: 0 };

    const forces = runIntentSteeringSystem([pet]);

    expect(forces[0]).toEqual({ id: "seek", x: 0, y: 0 });
  });

  it("eases steering while a pet approaches its target", () => {
    const pet = createSteeringPet("seek", 0.0018);
    pet.position = { x: 0, y: 0 };
    pet.motion.targetPosition = { x: 48, y: 0 };

    const forces = runIntentSteeringSystem([pet]);

    expect(forces[0].x).toBeGreaterThan(0);
    expect(forces[0].x).toBeLessThan(0.0018);
  });

  it("steers toward an avoidance waypoint before the final motion target", () => {
    const pet = createSteeringPet("seek", 0.0018);
    pet.motion.targetPosition = { x: SLOW_RADIUS * 2, y: 0 };
    pet.navigation.avoidanceWaypoint = { x: 0, y: SLOW_RADIUS * 2 };

    const forces = runIntentSteeringSystem([pet]);

    expect(forces[0].x).toBe(0);
    expect(forces[0].y).toBe(0.0018);
  });
});
