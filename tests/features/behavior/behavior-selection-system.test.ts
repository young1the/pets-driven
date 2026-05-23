import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runBehaviorSelectionSystem } from "@/features/behavior/systems";
import { createManualClock } from "@/shared/time/manual-clock";
import { createSeededRandom } from "@/shared/random/seeded-random";
import { createDemoScenario } from "@/core/scenario-fixtures";

function makeStore(prefOverride: Partial<{
  curiosity: number; sociability: number; playfulness: number; shyness: number;
}>) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: 480, y: 500 } },
      ],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "IntentState", intent: "idle" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        {
          type: "BehaviorPreference",
          curiosity: 0.5,
          sociability: 0.5,
          playfulness: 0.5,
          shyness: 0.2,
          ...prefOverride,
        },
      ],
    },
  ]);
}

describe("BehaviorSelectionSystem", () => {
  it("does nothing while the pet still has a motion target", () => {
    const store = makeStore({});
    store.setComponent("pet", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 600, y: 500 },
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("picks seek-user when sociability dominates", () => {
    const store = makeStore({ sociability: 0.95, shyness: 0.05 });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    const intent = store.getComponent("pet", "IntentState");
    const motion = store.getComponent("pet", "MotionTarget");
    expect(intent?.intent).toBe("seek");
    expect(motion?.targetEntityId).toBe("user-anchor");

    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.source).toBe("autonomous");
    expect(claim?.reason).toBe("seek-user");
  });

  it("picks wander-far when curiosity dominates", () => {
    const store = makeStore({
      curiosity: 0.95,
      sociability: 0.1,
      playfulness: 0.1,
      shyness: 0.05,
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    const intent = store.getComponent("pet", "IntentState");
    const motion = store.getComponent("pet", "MotionTarget");
    expect(intent?.intent).toBe("active");
    expect(motion?.targetPosition).not.toBeNull();
    // wander-far places target well away from pet position (200, 200)
    const dx = (motion?.targetPosition?.x ?? 0) - 200;
    const dy = (motion?.targetPosition?.y ?? 0) - 200;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(100);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("wander-far");
  });

  it("requests a jump when playfulness dominates and CanJump is ready", () => {
    const store = makeStore({ playfulness: 0.95, sociability: 0.1, shyness: 0.05 });
    store.setComponent("pet", { type: "CanJump", impulse: 0.009 });
    store.setComponent("pet", {
      type: "JumpActionState",
      phase: "ready",
      cooldownMs: 0,
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(7),
      { width: 960, height: 540 },
    );

    const jump = store.getComponent("pet", "JumpActionState");
    expect(jump?.phase).toBe("requested");
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("request-jump");
  });

  it("respects existing higher-priority claims", () => {
    const store = makeStore({});
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "agent-event",
      decidedAt: 0,
      expiresAt: 10_000,
      reason: "task.started",
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    // claim source must remain agent-event (not overwritten by autonomous)
    expect(store.getComponent("pet", "BehaviorDecisionState")?.source).toBe("agent-event");
  });

  it("is deterministic for the same seed", () => {
    const a = makeStore({});
    const b = makeStore({});

    runBehaviorSelectionSystem(a, createManualClock(0), createSeededRandom(42), { width: 960, height: 540 });
    runBehaviorSelectionSystem(b, createManualClock(0), createSeededRandom(42), { width: 960, height: 540 });

    expect(a.getComponent("pet", "MotionTarget"))
      .toEqual(b.getComponent("pet", "MotionTarget"));
    expect(a.getComponent("pet", "BehaviorDecisionState")?.reason)
      .toBe(b.getComponent("pet", "BehaviorDecisionState")?.reason);
  });
});

describe("BehaviorSelectionSystem (integration via world.step)", () => {
  it("picks a new behavior after arrival clears the motion target", () => {
    const { world, clock } = createDemoScenario();

    // Give pet-a a target very close to its starting position so arrival triggers
    // on the very first UPDATE phase.
    const before = world.snapshot().pets.find((p) => p.id === "pet-a");
    world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: (before?.position.x ?? 600) + 4, y: before?.position.y ?? 500 },
    });
    world.setComponent("pet-a", { type: "IntentState", intent: "active" });

    // Step 1: ArrivalBehaviorSystem detects arrival, clears the target, and
    // resets intent to "idle". BehaviorSelectionSystem runs in the BEHAVIOR
    // phase (before UPDATE), so it cannot react until the next step.
    clock.advanceBy(16);
    world.step(16);

    // Step 2: BehaviorSelectionSystem sees intent == "idle" and target == null.
    clock.advanceBy(16);
    world.step(16);

    const claim = world.getComponent("pet-a", "BehaviorDecisionState");
    expect(claim?.source).toBe("autonomous");
    expect([
      "wander-near",
      "wander-far",
      "seek-user",
      "request-jump",
      "request-climb",
      "idle-stay",
    ]).toContain(claim?.reason);
  });
});
