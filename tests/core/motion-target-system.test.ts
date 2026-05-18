import { describe, expect, it } from "vitest";
import { resolveMotionTargets } from "@/core/systems/motion-target-system";

function createPet(intent: string) {
  return {
    runtime: {
      intent,
      motion: {
        targetEntityId: null as string | null,
        targetPosition: null as { x: number; y: number } | null,
      },
    },
  };
}

describe("motion target system", () => {
  it("targets the user anchor for seek-user pets", () => {
    const pet = createPet("seek-user");

    resolveMotionTargets(
      [pet],
      [{ id: "user-anchor", kind: "user-anchor", position: { x: 480, y: 500 } }],
      { next: () => 0.5 },
      { width: 960, height: 540 },
    );

    expect(pet.runtime.motion).toEqual({
      targetEntityId: "user-anchor",
      targetPosition: { x: 480, y: 500 },
    });
  });

  it("chooses deterministic waypoints for idle pets", () => {
    const pet = createPet("idle");
    const randomValues = [0.25, 0.25];

    resolveMotionTargets(
      [pet],
      [],
      { next: () => randomValues.shift() ?? 0 },
      { width: 960, height: 540 },
    );

    expect(pet.runtime.motion).toEqual({
      targetEntityId: null,
      targetPosition: { x: 240, y: 135 },
    });
  });

  it("chooses deterministic waypoints for active pets", () => {
    const pet = createPet("active");
    const randomValues = [0.75, 0.75];

    resolveMotionTargets(
      [pet],
      [],
      { next: () => randomValues.shift() ?? 0 },
      { width: 960, height: 540 },
    );

    expect(pet.runtime.motion).toEqual({
      targetEntityId: null,
      targetPosition: { x: 720, y: 405 },
    });
  });
});
