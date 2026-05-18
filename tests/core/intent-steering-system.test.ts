import { describe, expect, it } from "vitest";
import { computeIntentSteeringForces } from "@/core/systems/intent-steering-system";

function createSteeringPet(intent: string, speed: number) {
  return {
    id: intent,
    position: { x: 0, y: 0 },
    movement: {
      idleSpeed: intent === "idle" ? speed : 0,
      activeSpeed: intent === "active" ? speed : 0,
      seekUserSpeed: intent === "seek-user" ? speed : 0,
    },
    runtime: {
      intent,
      motion: {
        targetEntityId: null,
        targetPosition: { x: 10, y: 0 },
      },
    },
  };
}

describe("intent steering system", () => {
  it("uses different movement speeds by intent", () => {
    const forces = computeIntentSteeringForces([
      createSteeringPet("idle", 0.0006),
      createSteeringPet("active", 0.0012),
      createSteeringPet("seek-user", 0.0018),
    ]);

    expect(forces.map((force) => force.x)).toEqual([0.0006, 0.0012, 0.0018]);
  });
});
