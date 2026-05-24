import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
} from "@/features/behavior/systems";
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
        { type: "IntentState", intent: "idle" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        {
          type: "Perception" as const,
          userAnchor: {
            id: "user-anchor",
            position: { x: 480, y: 500 },
            distance: Math.hypot(280, 300),
          },
          nearbyPets: [],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, intent: "idle" as const },
        },
        {
          type: "BehaviorPreference" as const,
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

describe("BehaviorDecisionSystem", () => {
  it("does nothing while the pet still has a motion target", () => {
    const store = makeStore({});
    store.setComponent("pet", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 600, y: 500 },
    });

    runBehaviorDecisionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("emits a BehaviorDecisionToken and does NOT mutate MotionTarget or intent", () => {
    const store = makeStore({ sociability: 0.95, shyness: 0.05 });

    runBehaviorDecisionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("seek-user");
    expect(token?.consumed).toBe(false);

    // Decision step must NOT plan — MotionTarget stays null
    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toBeNull();

    // Intent stays idle until Planning materializes
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("idle");
  });

  it("does not emit a token while already close to the user anchor", () => {
    const store = makeStore({ sociability: 0.95, shyness: 0.05 });
    store.setComponent("pet", {
      type: "Transform",
      position: { x: 492, y: 500 },
    });
    // update Perception to reflect proximity
    store.setComponent("pet", {
      type: "Perception",
      userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: 12 },
      nearbyPets: [],
      nearbyClimbables: [],
      self: { grounded: false, climbing: false, intent: "idle" as const },
    });

    runBehaviorDecisionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).not.toBe("seek-user");
  });

  it("does not repeat the same autonomous behavior immediately after its claim expires", () => {
    const store = makeStore({ sociability: 0.95, shyness: 0.05 });
    const clock = createManualClock(0);

    runBehaviorDecisionSystem(store, clock, createSeededRandom(1), { width: 960, height: 540 });
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("seek-user");

    store.setComponent("pet", { type: "IntentState", intent: "idle" as const });
    store.setComponent("pet", { type: "MotionTarget", targetEntityId: null, targetPosition: null });
    store.removeComponent("pet", "BehaviorDecisionToken");
    clock.advanceBy(600);

    runBehaviorDecisionSystem(store, clock, createSeededRandom(1), { width: 960, height: 540 });

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).not.toBe("seek-user");
  });

  it("picks wander-far when curiosity dominates", () => {
    const store = makeStore({
      curiosity: 0.95,
      sociability: 0.1,
      playfulness: 0.1,
      shyness: 0.05,
    });

    runBehaviorDecisionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("wander-far");
  });

  it("requests a jump when playfulness dominates and CanJump is ready", () => {
    const store = makeStore({ playfulness: 0.95, sociability: 0.1, shyness: 0.05 });
    store.setComponent("pet", { type: "CanJump", impulse: 0.009 });
    store.setComponent("pet", { type: "JumpActionState", phase: "ready", cooldownMs: 0 });

    runBehaviorDecisionSystem(
      store,
      createManualClock(0),
      createSeededRandom(7),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("request-jump");
    // jump state must NOT change yet (Planning does that)
    expect(store.getComponent("pet", "JumpActionState")?.phase).toBe("ready");
  });

  it("does not let two pets target the same climbable surface simultaneously", () => {
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 480, y: 500 } },
        ],
      },
      {
        id: "wall-a",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 120, y: 300 } },
        ],
      },
      {
        id: "pet-1",
        components: [
          { type: "Transform", position: { x: 100, y: 500 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "CanWallClimb", speed: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: 380 },
            nearbyPets: [{ id: "pet-2", position: { x: 140, y: 500 }, distance: 40 }],
            nearbyClimbables: [{ id: "wall-a", position: { x: 120, y: 300 }, distance: Math.hypot(20, 200) }],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "BehaviorPreference", curiosity: 0.7, sociability: 0.1, playfulness: 0.95, shyness: 0.05 },
        ],
      },
      {
        id: "pet-2",
        components: [
          { type: "Transform", position: { x: 140, y: 500 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "CanWallClimb", speed: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: 340 },
            nearbyPets: [{ id: "pet-1", position: { x: 100, y: 500 }, distance: 40 }],
            nearbyClimbables: [{ id: "wall-a", position: { x: 120, y: 300 }, distance: Math.hypot(20, 200) }],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "BehaviorPreference", curiosity: 0.7, sociability: 0.1, playfulness: 0.95, shyness: 0.05 },
        ],
      },
    ]);

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), { width: 960, height: 540 });

    const t1 = store.getComponent("pet-1", "BehaviorDecisionToken");
    const t2 = store.getComponent("pet-2", "BehaviorDecisionToken");
    const climbCount = [t1, t2].filter((t) => t?.kind === "request-climb").length;
    expect(climbCount).toBeLessThanOrEqual(1);
  });

  it("respects existing higher-priority claims", () => {
    const store = makeStore({});
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "agent-event",
      decidedAt: 0,
      expiresAt: 10_000,
      reason: "task.started",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runBehaviorDecisionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.source).toBe("agent-event");
  });

  it("is deterministic for the same seed", () => {
    const a = makeStore({});
    const b = makeStore({});

    runBehaviorDecisionSystem(a, createManualClock(0), createSeededRandom(42), { width: 960, height: 540 });
    runBehaviorDecisionSystem(b, createManualClock(0), createSeededRandom(42), { width: 960, height: 540 });

    expect(a.getComponent("pet", "BehaviorDecisionToken")?.kind)
      .toBe(b.getComponent("pet", "BehaviorDecisionToken")?.kind);
    expect(a.getComponent("pet", "BehaviorDecisionState")?.reason)
      .toBe(b.getComponent("pet", "BehaviorDecisionState")?.reason);
  });
});

describe("BehaviorPlanningSystem", () => {
  it("materializes a seek-user token into MotionTarget pointing at userAnchor", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 480, y: 500 }, distance: Math.hypot(280, 300) },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "seek-user" as const,
            decidedAt: 0,
            consumed: false,
            targetEntityId: "user-anchor",
            targetPosition: { x: 480, y: 500 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBe("user-anchor");
    expect(motion?.targetPosition).toEqual({ x: 480, y: 500 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("seek");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a wander-near token into MotionTarget with targetPosition", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "wander-near" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 250, y: 220 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toEqual({ x: 250, y: 220 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a request-jump token by setting JumpActionState to requested", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "JumpActionState", phase: "ready" as const, cooldownMs: 0 },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "request-jump" as const,
            decidedAt: 0,
            consumed: false,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "JumpActionState")?.phase).toBe("requested");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a request-climb token into ClimbIntentState", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "request-climb" as const,
            decidedAt: 0,
            consumed: false,
            climbSurfaceId: "wall-a",
            climbTargetY: 120,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const climbIntent = store.getComponent("pet", "ClimbIntentState");
    expect(climbIntent?.phase).toBe("approaching");
    expect(climbIntent?.surfaceEntityId).toBe("wall-a");
    expect(climbIntent?.targetY).toBe(120);
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("skips already-consumed tokens", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "idle-stay" as const,
            decidedAt: 0,
            consumed: true,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    // No state change since token was already consumed
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("idle");
  });
});

describe("BehaviorDecisionSystem + BehaviorPlanningSystem (integration via world.step)", () => {
  it("picks a new behavior after arrival clears the motion target", () => {
    const { world, clock } = createDemoScenario();

    const before = world.snapshot().pets.find((p) => p.id === "pet-a");
    world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: (before?.position.x ?? 600) + 4, y: before?.position.y ?? 500 },
    });
    world.setComponent("pet-a", { type: "IntentState", intent: "active" as const });

    clock.advanceBy(16);
    world.step(16);

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

  it("does not leave Charlie pinned on the completed climb target", () => {
    const { world, clock } = createDemoScenario();

    for (let index = 0; index < 160; index += 1) {
      clock.advanceBy(16);
      world.step(16);
    }

    const motion = world.getComponent("pet-c", "MotionTarget");
    const decision = world.getComponent("pet-c", "BehaviorDecisionState");

    expect(motion?.targetPosition).not.toEqual({ x: 280, y: 120 });
    expect(decision?.reason).not.toBe("request-climb");
  });

  it("collision does not hijack Charlie's climb target between frames 700-1200", () => {
    const { world, clock } = createDemoScenario();

    let climbingWithWrongTarget = false;

    for (let f = 0; f < 1200; f++) {
      clock.advanceBy(16);
      world.step(16);

      if (f < 700) continue;

      const climbing = world.getComponent("pet-c", "ClimbingState");
      const decision = world.getComponent("pet-c", "BehaviorDecisionState");
      const motion = world.getComponent("pet-c", "MotionTarget");

      if (climbing && decision?.source === "collision") {
        climbingWithWrongTarget = true;
      }

      if (climbing) {
        expect(decision?.source).not.toBe("collision");
      }

      if (f > 160) {
        expect(motion?.targetPosition).not.toEqual({ x: 280, y: 120 });
      }
    }

    expect(climbingWithWrongTarget).toBe(false);
  });
});
