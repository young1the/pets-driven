import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runClimbApproachSystem } from "@pets-driven/pet-engine/features/movement/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

function approachingPet(startedAt?: number) {
  return createComponentStore([
    {
      id: "wall",
      components: [
        { type: "ClimbableSurface" as const },
        { type: "Transform" as const, position: { x: 120, y: 500 } },
      ],
    },
    {
      id: "pet",
      components: [
        { type: "Transform" as const, position: { x: 130, y: 500 } },
        { type: "Steering" as const, mode: "pursue" as const },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 120, y: 500 },
        },
        { type: "CanWallClimb" as const, velocity: 1.1 },
        {
          type: "ClimbIntentState" as const,
          phase: "approaching" as const,
          surfaceEntityId: "wall",
          targetY: 200,
          ...(startedAt !== undefined ? { startedAt } : {}),
        },
        {
          type: "BehaviorDecisionState" as const,
          source: "autonomous" as const,
          decidedAt: startedAt ?? 0,
          expiresAt: (startedAt ?? 0) + 500,
          reason: "request-climb",
          lastAutonomousReason: "request-climb",
          lastAutonomousAt: startedAt ?? 0,
        },
      ],
    },
  ]);
}

describe("climb approach timeout", () => {
  it("cancels an approach that never manages to attach", () => {
    const store = approachingPet(0);

    runClimbApproachSystem(store, createManualClock(7_000));

    expect(store.getComponent("pet", "ClimbIntentState")).toBeUndefined();
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    // The repeat cooldown restarts from the cancellation, so the pet does not
    // immediately re-pick the same unclimbable surface.
    expect(store.getComponent("pet", "BehaviorDecisionState")?.decidedAt).toBe(7_000);
  });

  it("keeps steering toward the surface before the timeout", () => {
    const store = approachingPet(0);

    runClimbApproachSystem(store, createManualClock(3_000));

    expect(store.getComponent("pet", "ClimbIntentState")).toBeDefined();
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 120,
      y: 500,
    });
  });

  it("never times out states scripted without startedAt (legacy fixtures)", () => {
    const store = approachingPet(undefined);

    runClimbApproachSystem(store, createManualClock(1_000_000));

    expect(store.getComponent("pet", "ClimbIntentState")).toBeDefined();
  });

  /**
   * The budget is for an approach that is *stuck*, and a walk across the
   * desktop is not. Cancelling on elapsed time alone capped how far away a pet
   * could start a climb from — past that it would claim the climb, read
   * "Climbing" for the whole six seconds, cancel, and never reach a wall.
   */
  it("keeps a long walk alive as long as the pet is still closing on the wall", () => {
    const store = approachingPet(0);
    const transform = store.getComponent("pet", "Transform")!;
    transform.position.x = 1_020; // 900px out — further than the budget covers

    const clock = createManualClock(0);
    // Twelve seconds of steady walking, twice the timeout.
    for (let elapsed = 0; elapsed <= 12_000; elapsed += 500) {
      clock.advanceBy(500);
      transform.position.x = Math.max(120, transform.position.x - 40);
      runClimbApproachSystem(store, clock);
    }

    expect(store.getComponent("pet", "ClimbIntentState")).toBeDefined();
  });

  it("still cancels once the pet stops getting any closer", () => {
    const store = approachingPet(0);
    const transform = store.getComponent("pet", "Transform")!;
    transform.position.x = 1_020;

    const clock = createManualClock(0);
    // Walks for two seconds, then stalls short of the wall — the oscillation
    // this timeout exists to catch.
    for (let step = 0; step < 4; step += 1) {
      clock.advanceBy(500);
      transform.position.x -= 40;
      runClimbApproachSystem(store, clock);
    }
    for (let step = 0; step < 20; step += 1) {
      clock.advanceBy(500);
      // Jitter towards the wall and back: never an improvement on its best.
      transform.position.x += step % 2 === 0 ? 0.5 : -0.5;
      runClimbApproachSystem(store, clock);
    }

    expect(store.getComponent("pet", "ClimbIntentState")).toBeUndefined();
  });
});
