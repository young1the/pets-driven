import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { runBehaviorDecisionSystem } from "@pets-driven/pet-engine/features/behavior/decision-system";
import { runBehaviorPlanningSystem } from "@pets-driven/pet-engine/features/behavior/planning-system";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { width: 960, height: 540 };

function distanceFrom(
  origin: { x: number; y: number },
  target: { x: number; y: number } | undefined,
) {
  if (!target) return 0;
  return Math.hypot(target.x - origin.x, target.y - origin.y);
}

/**
 * Minimal store: one pet with OCEAN personality, a user anchor in Perception,
 * and no jump/climb capabilities. Perfect for testing seek-user / wander selection.
 */
function makeStore(
  prefOverride: Partial<{
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  }> = {},
) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [{ type: "UserAnchor" }, { type: "Transform", position: { x: 480, y: 500 } }],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Steering", mode: "stand" as const },
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
          self: { grounded: false, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.2,
          ...prefOverride,
        },
      ],
    },
  ]);
}

/**
 * Store with one nearby pet in Perception.nearbyPets.
 * userAnchor is null to isolate Phase 3 social candidates from seek-user.
 */
function makeNearbyStore(
  prefOverride: Partial<{
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  }> = {},
) {
  // other-pet is at distance 150 so the "approach-pet" candidate is included
  // and we can verify selection.
  return createComponentStore([
    {
      id: "other-pet",
      components: [{ type: "Transform", position: { x: 350, y: 200 } }],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Steering", mode: "stand" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        {
          type: "Perception" as const,
          userAnchor: null, // excluded so seek-user is never a candidate
          nearbyPets: [{ id: "other-pet", position: { x: 350, y: 200 }, distance: 150 }],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.2,
          ...prefOverride,
        },
      ],
    },
  ]);
}

describe("BehaviorDecisionSystem", () => {
  it("does nothing while the pet still has a motion target", () => {
    const store = makeStore();
    store.setComponent("pet", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 600, y: 500 },
    });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("emits a BehaviorDecisionToken and does NOT mutate MotionTarget or intent", () => {
    // High extraversion → seek-user scores highest
    const store = makeStore({ extraversion: 0.95, neuroticism: 0.05 });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("seek-user");
    expect(token?.consumed).toBe(false);

    // Decision step must NOT plan — MotionTarget stays null
    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toBeNull();

    // Intent stays idle until Planning materializes
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
  });

  it("does not emit a token while already close to the user anchor", () => {
    const store = makeStore({ extraversion: 0.95, neuroticism: 0.05 });
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
      self: { grounded: false, climbing: false, mode: "stand" as const },
    });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).not.toBe("seek-user");
  });

  it("does not repeat the same autonomous behavior immediately after its claim expires", () => {
    const store = makeStore({ extraversion: 0.95, neuroticism: 0.05 });
    const clock = createManualClock(0);

    runBehaviorDecisionSystem(store, clock, createSeededRandom(1), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("seek-user");

    store.setComponent("pet", { type: "Steering", mode: "stand" as const });
    store.setComponent("pet", { type: "MotionTarget", targetEntityId: null, targetPosition: null });
    store.removeComponent("pet", "BehaviorDecisionToken");
    clock.advanceBy(600);

    runBehaviorDecisionSystem(store, clock, createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).not.toBe("seek-user");
  });

  it("picks wander-far when openness dominates", () => {
    // High openness + low extraversion → wander-far scores highest, seek-user lowest
    const store = makeStore({ openness: 0.95, extraversion: 0.1, neuroticism: 0.05 });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("wander-far");
  });

  it("uses body-scaled wander radius when choosing the next motion target", () => {
    const origin = { x: 2000, y: 2000 };
    const wideBounds = { width: 4000, height: 4000 };

    function makeWanderStore(bodyWidth: number) {
      return createComponentStore([
        {
          id: "pet",
          components: [
            { type: "Transform", position: origin },
            { type: "PhysicsBody", shape: "rectangle", width: bodyWidth, height: 38 },
            { type: "Steering", mode: "stand" as const },
            { type: "MotionTarget", targetEntityId: null, targetPosition: null },
            { type: "WandersOnArrival", arrivalRadius: 16 },
            {
              type: "Perception" as const,
              userAnchor: null,
              nearbyPets: [],
              nearbyClimbables: [],
              self: { grounded: true, climbing: false, mode: "stand" as const },
            },
            {
              type: "Personality" as const,
              openness: 0.95,
              conscientiousness: 0.4,
              extraversion: 0.1,
              agreeableness: 0.5,
              neuroticism: 0.05,
            },
          ],
        },
      ]);
    }

    const normal = makeWanderStore(32);
    const large = makeWanderStore(64);

    runBehaviorDecisionSystem(normal, createManualClock(0), createSeededRandom(1), wideBounds);
    runBehaviorDecisionSystem(large, createManualClock(0), createSeededRandom(1), wideBounds);

    const normalTarget = normal.getComponent("pet", "BehaviorDecisionToken")?.targetPosition;
    const largeTarget = large.getComponent("pet", "BehaviorDecisionToken")?.targetPosition;

    expect(normal.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("wander-far");
    expect(large.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("wander-far");
    expect(distanceFrom(origin, largeTarget)).toBeGreaterThan(
      distanceFrom(origin, normalTarget) * 1.8,
    );
  });

  it("keeps wander targets in negative virtual-desktop coordinates", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: -320, y: 500 } },
          { type: "PhysicsBody", shape: "rectangle" as const, width: 32, height: 38 },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: true, climbing: false, mode: "stand" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.95,
            conscientiousness: 0.4,
            extraversion: 0.1,
            agreeableness: 0.5,
            neuroticism: 0.05,
          },
        ],
      },
    ]);

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), {
      x: -640,
      y: 0,
      width: 1600,
      height: 540,
    });

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("wander-far");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.targetPosition?.x).toBeLessThan(0);
  });

  it("requests a jump when action-tendency dominates and no jump action is active", () => {
    // High extraversion + moderate openness; seek-user excluded (no userAnchor in Perception)
    const store = makeStore({ extraversion: 0.9, openness: 0.6, neuroticism: 0.25 });
    // Remove user anchor from Perception so seek-user is not a candidate
    store.setComponent("pet", {
      type: "Perception",
      userAnchor: null,
      nearbyPets: [],
      nearbyClimbables: [],
      self: { grounded: false, climbing: false, mode: "stand" as const },
    });
    store.setComponent("pet", { type: "CanJump", impulse: 0.009 });

    // Seed 700 first output ≈ 0.507, inside the request-jump softmax bucket [0.489, 0.887]
    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(700), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("request-jump");
    // JumpActionState must not be created yet (Planning does that).
    expect(store.getComponent("pet", "JumpActionState")).toBeUndefined();
  });

  it("does not let two pets target the same climbable surface simultaneously", () => {
    // High openness + high extraversion → climb is dominant; userAnchor excluded from Perception
    const climbPersonality = {
      type: "Personality" as const,
      openness: 0.7,
      conscientiousness: 0.4,
      extraversion: 0.95,
      agreeableness: 0.5,
      neuroticism: 0.5,
    };
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [{ type: "UserAnchor" }, { type: "Transform", position: { x: 480, y: 500 } }],
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
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "CanWallClimb", velocity: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null, // excluded so climb can win
            nearbyPets: [{ id: "pet-2", position: { x: 140, y: 500 }, distance: 40 }],
            nearbyClimbables: [
              { id: "wall-a", position: { x: 120, y: 300 }, distance: Math.hypot(20, 200) },
            ],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          climbPersonality,
        ],
      },
      {
        id: "pet-2",
        components: [
          { type: "Transform", position: { x: 140, y: 500 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "CanWallClimb", velocity: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null, // excluded so climb can win
            nearbyPets: [{ id: "pet-1", position: { x: 100, y: 500 }, distance: 40 }],
            nearbyClimbables: [
              { id: "wall-a", position: { x: 120, y: 300 }, distance: Math.hypot(20, 200) },
            ],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          climbPersonality,
        ],
      },
    ]);

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    const t1 = store.getComponent("pet-1", "BehaviorDecisionToken");
    const t2 = store.getComponent("pet-2", "BehaviorDecisionToken");
    const climbCount = [t1, t2].filter((t) => t?.kind === "request-climb").length;
    expect(climbCount).toBeLessThanOrEqual(1);
  });

  it("respects existing higher-priority claims", () => {
    const store = makeStore();
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "agent-event",
      decidedAt: 0,
      expiresAt: 10_000,
      reason: "task.started",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.source).toBe("agent-event");
  });

  it("does not emit autonomous tokens while an agent state is held", () => {
    const store = makeStore();
    store.setComponent("pet", {
      type: "AgentTaskState",
      status: "waiting",
      since: 0,
      summary: "Needs approval",
    });
    store.setComponent("pet", { type: "TaskMovementHold", since: 0 });

    runBehaviorDecisionSystem(store, createManualClock(12_000), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")).toBeUndefined();
    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("is deterministic for the same seed", () => {
    const a = makeStore();
    const b = makeStore();

    runBehaviorDecisionSystem(a, createManualClock(0), createSeededRandom(42), BOUNDS);
    runBehaviorDecisionSystem(b, createManualClock(0), createSeededRandom(42), BOUNDS);

    expect(a.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe(
      b.getComponent("pet", "BehaviorDecisionToken")?.kind,
    );
    expect(a.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
      b.getComponent("pet", "BehaviorDecisionState")?.reason,
    );
  });
});

describe("BehaviorPlanningSystem", () => {
  it("materializes a seek-user token into intent=seek without writing MotionTarget", () => {
    // seek-user tokens carry no position: MotionTargetSystem (UPDATE phase) reads
    // Perception.userAnchor directly and is the sole owner of seek positioning.
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: {
              id: "user-anchor",
              position: { x: 480, y: 500 },
              distance: Math.hypot(280, 300),
            },
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "seek-user" as const,
            decidedAt: 0,
            consumed: false,
            // No targetEntityId / targetPosition — build() returns {} for seek-user.
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    // Planning must NOT write MotionTarget — MotionTargetSystem handles that.
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("arrive");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a wander-near token into MotionTarget with targetPosition", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
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
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a request-jump token by creating JumpActionState as requested", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
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
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
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
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("skips already-consumed tokens", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
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
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
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
    world.setComponent("pet-a", { type: "Steering", mode: "pursue" as const });

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
      "approach-pet",
      "flee-from-pet",
      "play-romp",
      // A completed movement now earns a personality-length rest beat before
      // the next decision; the claim is still autonomous.
      "arrival-dwell",
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

      const climbing = world.getComponent("pet-c", "ClimbingTag");
      const motion = world.getComponent("pet-c", "MotionTarget");

      // The real invariant: while climbing, MotionTarget must not point at the stale
      // pre-climb position. A stale BehaviorDecisionState.source="collision" is harmless
      // once CollisionBehaviorSystem skips the entity (because it has ClimbingTag).
      if (climbing && motion?.targetPosition?.x === 280 && motion?.targetPosition?.y === 120) {
        climbingWithWrongTarget = true;
      }

      if (f > 160) {
        expect(motion?.targetPosition).not.toEqual({ x: 280, y: 120 });
      }
    }

    expect(climbingWithWrongTarget).toBe(false);
  });
});

// ── Phase 2: Boltzmann/Softmax Sampling ─────────────────────────────────────

describe("BehaviorDecisionSystem — softmax sampling (Phase 2)", () => {
  /**
   * Simple 3-candidate store: no jump, no climb, Perception.userAnchor = null.
   * Candidates: wander-near, wander-far, idle-stay only.
   * O=0.6, E=0.6, A=0.5, N=0.5  →  T = 0.25*(1+1.2*0.5) = 0.4
   * Scores: near=0.56, far=0.62, idle=0.47
   * Theoretical: near≈33.8%, far≈39.3%, idle≈27.0%
   */
  function makeThreeCandidateStore() {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null, // no seek-user candidate
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.6,
            conscientiousness: 0.4,
            extraversion: 0.6,
            agreeableness: 0.5,
            neuroticism: 0.5,
          },
        ],
      },
    ]);
  }

  it("samples a distribution matching theoretical softmax probabilities (±5%)", () => {
    const SAMPLES = 1000;
    const counts: Record<string, number> = {};

    for (let seed = 0; seed < SAMPLES; seed++) {
      const store = makeThreeCandidateStore();
      // Multiply by 1013 (odd, coprime to 2^32) so consecutive seeds produce first PRNG
      // values spread uniformly across [0,1] rather than clustering in a narrow band.
      runBehaviorDecisionSystem(
        store,
        createManualClock(0),
        createSeededRandom(seed * 1013 + 7),
        BOUNDS,
      );
      const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }

    // T=0.4; theoretical softmax probabilities (calculated from scores above)
    const theoretical: Record<string, number> = {
      "wander-near": 338,
      "wander-far": 393,
      "idle-stay": 270,
    };
    const tolerance = SAMPLES * 0.05; // ±50

    for (const [kind, expected] of Object.entries(theoretical)) {
      expect(counts[kind] ?? 0).toBeGreaterThanOrEqual(expected - tolerance);
      expect(counts[kind] ?? 0).toBeLessThanOrEqual(expected + tolerance);
    }
  });

  it("stores the softmax roll trace on the emitted decision token", () => {
    const store = makeThreeCandidateStore();

    runBehaviorDecisionSystem(store, createManualClock(0), { next: () => 0.35 }, BOUNDS);

    const trace = store.getComponent("pet", "BehaviorDecisionToken")?.selectionTrace;

    expect(trace?.temperature).toBeCloseTo(0.4);
    expect(trace?.randomRoll).toBeCloseTo(0.35);
    expect(trace?.selectedKind).toBe("wander-far");
    expect(trace?.candidates.map((candidate) => candidate.kind)).toEqual([
      "wander-near",
      "wander-far",
      "idle-stay",
    ]);
    expect(
      trace?.candidates.reduce((sum, candidate) => sum + candidate.probability, 0),
    ).toBeCloseTo(1);
    expect(trace?.candidates.find((candidate) => candidate.kind === "wander-far")?.selected).toBe(
      true,
    );
  });

  it("high-neuroticism pets show more uniform distribution than low-neuroticism", () => {
    const SAMPLES = 1000;

    function dominantCount(neuroticism: number): number {
      const counts: Record<string, number> = {};
      for (let seed = 0; seed < SAMPLES; seed++) {
        const store = createComponentStore([
          {
            id: "pet",
            components: [
              { type: "Transform", position: { x: 200, y: 200 } },
              { type: "Steering", mode: "stand" as const },
              { type: "MotionTarget", targetEntityId: null, targetPosition: null },
              {
                type: "Perception" as const,
                userAnchor: null,
                nearbyPets: [],
                nearbyClimbables: [],
                self: { grounded: false, climbing: false, mode: "stand" as const },
              },
              {
                type: "Personality" as const,
                openness: 0.6,
                conscientiousness: 0.4,
                extraversion: 0.6,
                agreeableness: 0.5,
                neuroticism,
              },
            ],
          },
        ]);
        // Multiply by 1013 to spread seeds uniformly across the PRNG's output range.
        runBehaviorDecisionSystem(
          store,
          createManualClock(0),
          createSeededRandom(seed * 1013 + 7),
          BOUNDS,
        );
        const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
        counts[kind] = (counts[kind] ?? 0) + 1;
      }
      return Math.max(...Object.values(counts));
    }

    const lowN = dominantCount(0.0); // T=0.25 → more concentrated
    const highN = dominantCount(1.0); // T=0.55 → more uniform

    // Higher neuroticism → flatter distribution → lower dominant-choice count
    expect(highN).toBeLessThan(lowN);
  });
});

// ── Phase 3: Social Candidates (approach-pet / flee-from-pet) ─────────────

describe("BehaviorDecisionSystem — Phase 3 social candidates", () => {
  it("approach-pet and flee-from-pet are not candidates when nearbyPets is empty", () => {
    // makeStore() has nearbyPets=[]; verify social kinds never appear over 200 seeds.
    let foundApproach = false;
    let foundFlee = false;
    for (let seed = 0; seed < 200; seed++) {
      const store = makeStore({ extraversion: 0.9, agreeableness: 0.9 });
      runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(seed), BOUNDS);
      const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind;
      if (kind === "approach-pet") foundApproach = true;
      if (kind === "flee-from-pet") foundFlee = true;
    }
    expect(foundApproach).toBe(false);
    expect(foundFlee).toBe(false);
  });

  it("selects approach-pet for high-E high-A low-N personality (seed 1)", () => {
    // E=0.9, A=0.9, N=0.1 → approach-pet score ≈ 1.26 (highest), T≈0.28
    // Seed 1 first random ≈ 0.2365 → approach-pet bucket [0.1263, 0.9679) ✓
    const store = makeNearbyStore({ extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.1 });
    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("approach-pet");
  });

  it("selects flee-from-pet for high-N low-A personality (seed 800)", () => {
    // N=1.0, A=0.0, E=0.1 → flee-from-pet score = 0.80, wander-near = 0.75, T≈0.55
    // Seed 800 first random ≈ 0.5461 → flee-from-pet bucket [0.4780, 0.7579) ✓
    const store = makeNearbyStore({ neuroticism: 1.0, agreeableness: 0.0, extraversion: 0.1 });
    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(800), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).toBe("flee-from-pet");
  });

  it("stores approach-pet as an entity-tracked target at the nearby pet position", () => {
    // Pet at (200,200), other at (350,200), distance=150.
    // approach target follows the other pet's entity id and current position,
    // allowing the pet to continue until collision interrupts the behavior.
    const store = makeNearbyStore({ extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.1 });
    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);
    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("approach-pet");
    expect(token?.targetEntityId).toBe("other-pet");
    expect(token?.targetPosition?.x).toBeCloseTo(350, 0);
    expect(token?.targetPosition?.y).toBeCloseTo(200, 0);
  });

  it("does not scale approach-pet target away from the tracked entity", () => {
    const store = makeNearbyStore({ extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.1 });
    store.setComponent("pet", {
      type: "PhysicsBody",
      shape: "rectangle",
      width: 40,
      height: 38,
    });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("approach-pet");
    expect(token?.targetEntityId).toBe("other-pet");
    expect(token?.targetPosition?.x).toBeCloseTo(350, 0);
  });

  it("scales flee distance from the pet body width", () => {
    const store = createComponentStore([
      { id: "other-pet", components: [{ type: "Transform", position: { x: 650, y: 200 } }] },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 500, y: 200 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 38 },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [{ id: "other-pet", position: { x: 650, y: 200 }, distance: 150 }],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.1,
            agreeableness: 0,
            neuroticism: 1,
          },
        ],
      },
    ]);

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(800), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("flee-from-pet");
    expect(token?.targetPosition?.x).toBeCloseTo(260, 0);
    expect(token?.targetPosition?.y).toBeCloseTo(200, 0);
  });

  it("can emit approach-pet when the nearby pet is close but not colliding yet", () => {
    const store = createComponentStore([
      { id: "other-pet", components: [{ type: "Transform", position: { x: 270, y: 200 } }] },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [{ id: "other-pet", position: { x: 270, y: 200 }, distance: 70 }],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.9,
            agreeableness: 0.9,
            neuroticism: 0.1,
          },
        ],
      },
    ]);

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("approach-pet");
    expect(token?.targetEntityId).toBe("other-pet");
    expect(token?.targetPosition).toEqual({ x: 270, y: 200 });
  });
});

// ── Cursor play: chase-cursor candidate ─────────────────────────────────────

describe("BehaviorDecisionSystem — chase-cursor candidate", () => {
  /**
   * Pet sits close to the user-anchor (distance 20 <= USER_PROXIMITY_RADIUS
   * of 96) so seek-user is excluded, isolating chase-cursor against only
   * wander-near / wander-far / idle-stay.
   */
  function makeChaseCursorStore(
    cursor: {
      position: { x: number; y: number };
      distance: number;
      speed: number;
      isPlayful: boolean;
    } | null,
    prefOverride: Partial<{
      openness: number;
      conscientiousness: number;
      extraversion: number;
      agreeableness: number;
      neuroticism: number;
    }> = {},
  ) {
    return createComponentStore([
      {
        id: "user-anchor",
        components: [{ type: "UserAnchor" }, { type: "Transform", position: { x: 220, y: 200 } }],
      },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: { id: "user-anchor", position: { x: 220, y: 200 }, distance: 20 },
            nearbyPets: [],
            nearbyClimbables: [],
            cursor,
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.5,
            conscientiousness: 0.4,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.2,
            ...prefOverride,
          },
        ],
      },
    ]);
  }

  const playfulCursor = {
    position: { x: 220, y: 200 },
    distance: 20,
    speed: 900,
    isPlayful: true,
  };

  it("is never a candidate when Perception.cursor is null", () => {
    let found = false;
    for (let seed = 0; seed < 200; seed++) {
      const store = makeChaseCursorStore(null, {
        extraversion: 0.95,
        openness: 0.9,
        neuroticism: 0.05,
      });
      runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(seed), BOUNDS);
      if (store.getComponent("pet", "BehaviorDecisionToken")?.kind === "chase-cursor") {
        found = true;
      }
    }
    expect(found).toBe(false);
  });

  it("is never a candidate when the cursor is not playful", () => {
    let found = false;
    for (let seed = 0; seed < 200; seed++) {
      const store = makeChaseCursorStore(
        { position: { x: 220, y: 200 }, distance: 20, speed: 50, isPlayful: false },
        { extraversion: 0.95, openness: 0.9, neuroticism: 0.05 },
      );
      runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(seed), BOUNDS);
      if (store.getComponent("pet", "BehaviorDecisionToken")?.kind === "chase-cursor") {
        found = true;
      }
    }
    expect(found).toBe(false);
  });

  it("dominates selection for a high-E high-O low-N personality when the cursor is playful", () => {
    const SAMPLES = 200;
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < SAMPLES; seed++) {
      const store = makeChaseCursorStore(playfulCursor, {
        extraversion: 1,
        openness: 1,
        neuroticism: 0,
      });
      runBehaviorDecisionSystem(
        store,
        createManualClock(0),
        createSeededRandom(seed * 1013 + 7),
        BOUNDS,
      );
      const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    // scoreChaseCursor(E=1,O=1,N=0) = 1.8 vs. next-best wander-far = 1.0 —
    // softmax gives chase-cursor >90% of the probability mass.
    expect(counts["chase-cursor"] ?? 0).toBeGreaterThan(SAMPLES * 0.85);
  });

  it("is suppressed for a high-neuroticism personality even when the cursor is playful", () => {
    // N=1 drags scoreChaseCursor down (0.4+0.9*0.2+0.5*0.2-0.5*1 = 0.18) below
    // wander-near/flee-leaning candidates, so it should rarely dominate.
    const SAMPLES = 200;
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < SAMPLES; seed++) {
      const store = makeChaseCursorStore(playfulCursor, {
        extraversion: 0.2,
        openness: 0.2,
        neuroticism: 1,
      });
      runBehaviorDecisionSystem(
        store,
        createManualClock(0),
        createSeededRandom(seed * 1013 + 7),
        BOUNDS,
      );
      const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    expect(counts["chase-cursor"] ?? 0).toBeLessThan(SAMPLES * 0.5);
  });

  it("targets the user-anchor entity id and its current (cursor-driven) position", () => {
    const store = makeChaseCursorStore(playfulCursor, {
      extraversion: 1,
      openness: 1,
      neuroticism: 0,
    });
    // Softmax-dominant chase-cursor candidate: r=0.5 safely lands inside its
    // >90%-probability bucket regardless of push order.
    runBehaviorDecisionSystem(store, createManualClock(0), { next: () => 0.5 }, BOUNDS);

    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("chase-cursor");
    expect(token?.targetEntityId).toBe("user-anchor");
    expect(token?.targetPosition).toEqual({ x: 220, y: 200 });
  });

  it("materializes a chase-cursor token into MotionTarget with intent=active", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "chase-cursor" as const,
            decidedAt: 0,
            consumed: false,
            targetEntityId: "user-anchor",
            targetPosition: { x: 260, y: 210 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBe("user-anchor");
    expect(motion?.targetPosition).toEqual({ x: 260, y: 210 });
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("does not repeat chase-cursor immediately after its claim expires (cooldown)", () => {
    const store = makeChaseCursorStore(playfulCursor, {
      extraversion: 1,
      openness: 1,
      neuroticism: 0,
    });
    const clock = createManualClock(0);

    runBehaviorDecisionSystem(store, clock, { next: () => 0.5 }, BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("chase-cursor");

    store.setComponent("pet", { type: "Steering", mode: "stand" as const });
    store.setComponent("pet", { type: "MotionTarget", targetEntityId: null, targetPosition: null });
    store.removeComponent("pet", "BehaviorDecisionToken");
    // Past the 500ms autonomous claim duration (so a new decision can fire)
    // but still well under the 2_000ms chase-cursor repeat cooldown.
    clock.advanceBy(600);

    runBehaviorDecisionSystem(store, clock, { next: () => 0.5 }, BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).not.toBe("chase-cursor");
  });
});

describe("BehaviorPlanningSystem — Phase 3 social tokens", () => {
  function makeSocialTokenStore(
    kind: "approach-pet" | "flee-from-pet",
    targetPosition: { x: number; y: number },
  ) {
    return createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "Steering", mode: "stand" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          {
            type: "BehaviorDecisionToken" as const,
            kind,
            decidedAt: 0,
            consumed: false,
            targetPosition,
          },
        ],
      },
    ]);
  }

  it("materializes an approach-pet token into MotionTarget with intent=active", () => {
    const store = makeSocialTokenStore("approach-pet", { x: 250, y: 200 });
    store.setComponent("pet", {
      type: "BehaviorDecisionToken",
      kind: "approach-pet",
      decidedAt: 0,
      consumed: false,
      targetEntityId: "other-pet",
      targetPosition: { x: 250, y: 200 },
    });

    runBehaviorPlanningSystem(store, createManualClock(0));

    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBe("other-pet");
    expect(motion?.targetPosition).toEqual({ x: 250, y: 200 });
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a flee-from-pet token into MotionTarget with intent=active", () => {
    const store = makeSocialTokenStore("flee-from-pet", { x: 100, y: 200 });
    runBehaviorPlanningSystem(store, createManualClock(0));
    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toEqual({ x: 100, y: 200 });
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });
});

// ─── Drives-aware decisions ─────────────────────────────────────────────────
//
// A separate store builder (rather than editing makeStore/makeNearbyStore
// above) so every pre-existing test in this file keeps running against the
// exact same fixtures it always has — pets built without Drives must decide
// exactly as before.

function makeStoreWithDrives(
  prefOverride: Partial<{
    catalogId: PetPersonalityId;
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  }> = {},
  drivesOverride: Partial<{ social: number; energy: number; curiosity: number }> = {},
) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [{ type: "UserAnchor" }, { type: "Transform", position: { x: 480, y: 500 } }],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Steering", mode: "stand" as const },
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
          self: { grounded: false, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.2,
          ...prefOverride,
        },
        {
          type: "Drives" as const,
          social: 0.3,
          energy: 1,
          curiosity: 0.2,
          ...drivesOverride,
        },
      ],
    },
  ]);
}

function makeNearbyStoreWithDrives(
  drivesOverride: Partial<{ social: number; energy: number; curiosity: number }> = {},
) {
  return createComponentStore([
    {
      id: "other-pet",
      components: [{ type: "Transform", position: { x: 350, y: 200 } }],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Steering", mode: "stand" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        {
          type: "Perception" as const,
          userAnchor: null,
          nearbyPets: [{ id: "other-pet", position: { x: 350, y: 200 }, distance: 150 }],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, mode: "stand" as const },
        },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.2,
        },
        {
          type: "Drives" as const,
          social: 0.3,
          energy: 1,
          curiosity: 0.2,
          ...drivesOverride,
        },
      ],
    },
  ]);
}

/** Fraction of total selection weight assigned to `kind`, from the trace. */
function selectionProbability(store: ReturnType<typeof makeStoreWithDrives>, kind: string) {
  const trace = store.getComponent("pet", "BehaviorDecisionToken")?.selectionTrace;
  return trace?.candidates.find((c) => c.kind === kind)?.probability ?? 0;
}

describe("BehaviorDecisionSystem — Drives-aware scoring", () => {
  it("applies Mood after personality and drive scoring", () => {
    const frightened = makeStoreWithDrives();
    frightened.setComponent("pet", {
      type: "MoodState",
      valence: -0.5,
      arousal: 1,
      confidence: 0.1,
    });
    runBehaviorDecisionSystem(frightened, createManualClock(0), createSeededRandom(1), BOUNDS);

    const confident = makeStoreWithDrives();
    confident.setComponent("pet", {
      type: "MoodState",
      valence: 0.3,
      arousal: 0.35,
      confidence: 0.9,
    });
    runBehaviorDecisionSystem(confident, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(selectionProbability(frightened, "wander-far")).toBeLessThan(
      selectionProbability(confident, "wander-far"),
    );
    expect(selectionProbability(frightened, "seek-user")).toBeGreaterThan(
      selectionProbability(confident, "seek-user"),
    );
  });

  it("applies the Personality Catalog signature to the actual decision trace", () => {
    const attentive = makeStoreWithDrives({ catalogId: "attentive" });
    runBehaviorDecisionSystem(attentive, createManualClock(0), createSeededRandom(1), BOUNDS);

    const aloof = makeStoreWithDrives({ catalogId: "aloof" });
    runBehaviorDecisionSystem(aloof, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(selectionProbability(attentive, "seek-user")).toBeGreaterThan(
      selectionProbability(aloof, "seek-user"),
    );
    expect(selectionProbability(aloof, "beckon")).toBeLessThan(
      selectionProbability(attentive, "beckon"),
    );
  });

  it("a lonely pet (social near 1) is far more likely to approach a nearby pet than a satisfied one", () => {
    const lonely = makeNearbyStoreWithDrives({ social: 0.95 });
    runBehaviorDecisionSystem(lonely, createManualClock(0), createSeededRandom(1), BOUNDS);
    const lonelyProbability = selectionProbability(lonely, "approach-pet");

    const satisfied = makeNearbyStoreWithDrives({ social: 0.05 });
    runBehaviorDecisionSystem(satisfied, createManualClock(0), createSeededRandom(1), BOUNDS);
    const satisfiedProbability = selectionProbability(satisfied, "approach-pet");

    expect(lonelyProbability).toBeGreaterThan(satisfiedProbability);
  });

  it("a lonely pet (social near 1) is far more likely to seek the user than a satisfied one", () => {
    const lonely = makeStoreWithDrives({}, { social: 0.95 });
    runBehaviorDecisionSystem(lonely, createManualClock(0), createSeededRandom(1), BOUNDS);
    const lonelyProbability = selectionProbability(lonely, "seek-user");

    const satisfied = makeStoreWithDrives({}, { social: 0.05 });
    runBehaviorDecisionSystem(satisfied, createManualClock(0), createSeededRandom(1), BOUNDS);
    const satisfiedProbability = selectionProbability(satisfied, "seek-user");

    expect(lonelyProbability).toBeGreaterThan(satisfiedProbability);
  });

  it("a tired pet (low energy) is far more likely to idle-stay than a rested one", () => {
    const tired = makeStoreWithDrives({}, { energy: 0.05 });
    runBehaviorDecisionSystem(tired, createManualClock(0), createSeededRandom(1), BOUNDS);
    const tiredProbability = selectionProbability(tired, "idle-stay");

    const rested = makeStoreWithDrives({}, { energy: 1 });
    runBehaviorDecisionSystem(rested, createManualClock(0), createSeededRandom(1), BOUNDS);
    const restedProbability = selectionProbability(rested, "idle-stay");

    expect(tiredProbability).toBeGreaterThan(restedProbability);
  });

  it("a bored pet (high curiosity) is far more likely to wander-far than a curious-satisfied one", () => {
    const bored = makeStoreWithDrives({}, { curiosity: 0.95 });
    runBehaviorDecisionSystem(bored, createManualClock(0), createSeededRandom(1), BOUNDS);
    const boredProbability = selectionProbability(bored, "wander-far");

    const content = makeStoreWithDrives({}, { curiosity: 0.05 });
    runBehaviorDecisionSystem(content, createManualClock(0), createSeededRandom(1), BOUNDS);
    const contentProbability = selectionProbability(content, "wander-far");

    expect(boredProbability).toBeGreaterThan(contentProbability);
  });
});

describe("BehaviorPlanningSystem — Drives satisfaction hooks", () => {
  it("collision-engage partially refills social", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Drives" as const, social: 0.6, energy: 1, curiosity: 0.2 },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "collision-engage" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 210, y: 200 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Drives")!.social).toBeLessThan(0.6);
  });

  it("wander-far reduces curiosity", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Drives" as const, social: 0.3, energy: 1, curiosity: 0.8 },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "wander-far" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 400, y: 200 },
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Drives")!.curiosity).toBeLessThan(0.8);
  });

  it("request-jump costs energy", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Drives" as const, social: 0.3, energy: 1, curiosity: 0.2 },
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

    expect(store.getComponent("pet", "Drives")!.energy).toBeLessThan(1);
  });

  it("request-climb costs energy and reduces curiosity", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Drives" as const, social: 0.3, energy: 1, curiosity: 0.8 },
          {
            type: "BehaviorDecisionToken" as const,
            kind: "request-climb" as const,
            decidedAt: 0,
            consumed: false,
            climbSurfaceId: "wall-1",
            climbTargetY: 100,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    const drives = store.getComponent("pet", "Drives")!;
    expect(drives.energy).toBeLessThan(1);
    expect(drives.curiosity).toBeLessThan(0.8);
  });

  it("does nothing to Drives when the entity has none (backward compatible)", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          {
            type: "BehaviorDecisionToken" as const,
            kind: "wander-far" as const,
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 400, y: 200 },
          },
        ],
      },
    ]);

    expect(() => runBehaviorPlanningSystem(store, createManualClock(0))).not.toThrow();
    expect(store.getComponent("pet", "Drives")).toBeUndefined();
  });
});
