import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPersonalSpaceSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

const BOUNDS = { x: 0, y: 0, width: 960, height: 540 };

function idlePet(id: string, x: number, extra: Record<string, unknown>[] = []) {
  return {
    id,
    components: [
      { type: "Transform" as const, position: { x, y: 500 } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: 32,
        height: 38,
      },
      { type: "PetIdentity" as const, name: id },
      { type: "Steering" as const, mode: "stand" as const },
      {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      },
      { type: "WalkingTag" as const },
      {
        type: "ContactState" as const,
        grounded: true,
        climbableSurfaceId: null,
        climbableSurfacePosition: null,
      },
      ...extra,
    ] as never,
  };
}

function overlap(id: string, otherId: string, otherX: number) {
  return {
    type: "PetCollision" as const,
    otherEntityId: otherId,
    otherPosition: { x: otherX, y: 500 },
    startedAt: 0,
    lastSeenAt: 0,
  };
}

describe("personal space system (make-room shuffle)", () => {
  it("steps two stacked idle pets apart, away from each other", () => {
    const store = createComponentStore([
      idlePet("pet-a", 400, [overlap("pet-a", "pet-b", 404)]),
      idlePet("pet-b", 404, [overlap("pet-b", "pet-a", 400)]),
    ]);

    runPersonalSpaceSystem(store, createManualClock(0), BOUNDS);

    const a = store.getComponent("pet-a", "MotionTarget");
    const b = store.getComponent("pet-b", "MotionTarget");
    // pet-a (left) steps left, pet-b (right) steps right.
    expect(a?.targetPosition?.x).toBeLessThan(400);
    expect(b?.targetPosition?.x).toBeGreaterThan(404);
    // A casual shuffle, not a dash.
    expect(a?.speedFactor).toBeLessThan(1);
    expect(store.getComponent("pet-a", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "autonomous",
      reason: "make-room",
    });
  });

  it("splits perfectly-aligned pets deterministically by id", () => {
    const store = createComponentStore([
      idlePet("pet-a", 400, [overlap("pet-a", "pet-b", 400)]),
      idlePet("pet-b", 400, [overlap("pet-b", "pet-a", 400)]),
    ]);

    runPersonalSpaceSystem(store, createManualClock(0), BOUNDS);

    // Lexicographically smaller id steps left, the other right.
    expect(
      store.getComponent("pet-a", "MotionTarget")?.targetPosition?.x,
    ).toBeLessThan(400);
    expect(
      store.getComponent("pet-b", "MotionTarget")?.targetPosition?.x,
    ).toBeGreaterThan(400);
  });

  it("ignores pets that merely touch at the edges (not stacked)", () => {
    // Centers 30px apart: overlapping AABBs but past the stacking threshold.
    const store = createComponentStore([
      idlePet("pet-a", 400, [overlap("pet-a", "pet-b", 430)]),
      idlePet("pet-b", 430, [overlap("pet-b", "pet-a", 400)]),
    ]);

    runPersonalSpaceSystem(store, createManualClock(0), BOUNDS);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("never touches a pet owned by a live claim (e.g. a social session)", () => {
    const store = createComponentStore([
      idlePet("pet-a", 400, [
        overlap("pet-a", "pet-b", 404),
        {
          type: "BehaviorDecisionState",
          source: "social",
          decidedAt: 0,
          expiresAt: 5_000,
          reason: "session-chat",
          lastAutonomousReason: null,
          lastAutonomousAt: null,
        },
      ]),
      idlePet("pet-b", 404, [overlap("pet-b", "pet-a", 400)]),
    ]);

    runPersonalSpaceSystem(store, createManualClock(100), BOUNDS);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.reason).toBe(
      "session-chat",
    );
  });

  it("does not shuffle a non-overlapping pet", () => {
    const store = createComponentStore([idlePet("pet-a", 400)]);

    runPersonalSpaceSystem(store, createManualClock(0), BOUNDS);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("respects the make-room repeat cooldown", () => {
    const store = createComponentStore([
      idlePet("pet-a", 400, [
        overlap("pet-a", "pet-b", 404),
        {
          type: "BehaviorDecisionState",
          source: "autonomous",
          // Claim already lapsed, but the last make-room was recent.
          decidedAt: 500,
          expiresAt: 900,
          reason: "make-room",
          lastAutonomousReason: "make-room",
          lastAutonomousAt: 500,
        },
      ]),
      idlePet("pet-b", 404, [overlap("pet-b", "pet-a", 400)]),
    ]);

    // 1s after the last shuffle — inside the 4s cooldown.
    runPersonalSpaceSystem(store, createManualClock(1_500), BOUNDS);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("stays put when boxed against a wall with nowhere to step", () => {
    // pet-a hard against the left bound; the other pet is to its right, so the
    // step direction is further left — into the wall — and must be skipped.
    const store = createComponentStore([
      idlePet("pet-a", 50, [overlap("pet-a", "pet-b", 54)]),
      idlePet("pet-b", 54, [overlap("pet-b", "pet-a", 50)]),
    ]);

    runPersonalSpaceSystem(store, createManualClock(0), BOUNDS);

    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
  });
});
