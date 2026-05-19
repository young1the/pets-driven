import { describe, expect, it } from "vitest";
import type { PetIntent } from "@/core/components/simulation-components";
import { runMotionTargetSystem } from "@/core/systems/motion-target-system";

function createPet(intent: PetIntent) {
  return {
    id: "pet-a",
    intent: {
      type: "IntentState" as const,
      intent,
    },
    motion: {
      type: "MotionTarget" as const,
      targetEntityId: null as string | null,
      targetPosition: null as { x: number; y: number } | null,
    },
  };
}

describe("motion target system", () => {
  it("targets the user anchor for seeking pets", () => {
    const pet = createPet("seek");

    runMotionTargetSystem(
      [pet],
      [
        {
          id: "user-anchor",
          transform: { type: "Transform", position: { x: 480, y: 500 } },
        },
      ],
      { next: () => 0.5 },
      { width: 960, height: 540 },
    );

    expect(pet.motion).toEqual({
      type: "MotionTarget",
      targetEntityId: "user-anchor",
      targetPosition: { x: 480, y: 500 },
    });
  });

  it("chooses deterministic waypoints for idle pets", () => {
    const pet = createPet("idle");
    const randomValues = [0.25, 0.25];

    runMotionTargetSystem(
      [pet],
      [],
      { next: () => randomValues.shift() ?? 0 },
      { width: 960, height: 540 },
    );

    expect(pet.motion).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 240, y: 135 },
    });
  });

  it("chooses deterministic waypoints for active pets", () => {
    const pet = createPet("active");
    const randomValues = [0.75, 0.75];

    runMotionTargetSystem(
      [pet],
      [],
      { next: () => randomValues.shift() ?? 0 },
      { width: 960, height: 540 },
    );

    expect(pet.motion).toEqual({
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 720, y: 405 },
    });
  });
});
