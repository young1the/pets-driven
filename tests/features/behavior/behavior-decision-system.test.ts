import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
} from "@/features/behavior/systems";
import { createManualClock } from "@/shared/time/manual-clock";
import { createSeededRandom } from "@/shared/random/seeded-random";
import { createDemoScenario } from "@/core/scenario-fixtures";

const BOUNDS = { width: 960, height: 540 };

/**
 * Minimal store: one pet with OCEAN personality, a user anchor in Perception,
 * and no jump/climb capabilities. Perfect for testing seek-user / wander selection.
 */
function makeStore(prefOverride: Partial<{
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}> = {}) {
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
function makeNearbyStore(prefOverride: Partial<{
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}> = {}) {
  // other-pet is at distance 150 (well beyond the default 80px social stop distance)
  // so the "approach-pet" candidate is included and we can verify selection.
  return createComponentStore([
    {
      id: "other-pet",
      components: [
        { type: "Transform", position: { x: 350, y: 200 } },
      ],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "IntentState", intent: "idle" as const },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        {
          type: "Perception" as const,
          userAnchor: null, // excluded so seek-user is never a candidate
          nearbyPets: [{ id: "other-pet", position: { x: 350, y: 200 }, distance: 150 }],
          nearbyClimbables: [],
          self: { grounded: false, climbing: false, intent: "idle" as const },
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
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("idle");
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
      self: { grounded: false, climbing: false, intent: "idle" as const },
    });

    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionToken")?.kind).not.toBe("seek-user");
  });

  it("does not repeat the same autonomous behavior immediately after its claim expires", () => {
    const store = makeStore({ extraversion: 0.95, neuroticism: 0.05 });
    const clock = createManualClock(0);

    runBehaviorDecisionSystem(store, clock, createSeededRandom(1), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("seek-user");

    store.setComponent("pet", { type: "IntentState", intent: "idle" as const });
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

  it("requests a jump when action-tendency dominates and no jump action is active", () => {
    // High extraversion + moderate openness; seek-user excluded (no userAnchor in Perception)
    const store = makeStore({ extraversion: 0.9, openness: 0.6, neuroticism: 0.25 });
    // Remove user anchor from Perception so seek-user is not a candidate
    store.setComponent("pet", {
      type: "Perception",
      userAnchor: null,
      nearbyPets: [],
      nearbyClimbables: [],
      self: { grounded: false, climbing: false, intent: "idle" as const },
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
          { type: "CanWallClimb", velocity: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null, // excluded so climb can win
            nearbyPets: [{ id: "pet-2", position: { x: 140, y: 500 }, distance: 40 }],
            nearbyClimbables: [{ id: "wall-a", position: { x: 120, y: 300 }, distance: Math.hypot(20, 200) }],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          climbPersonality,
        ],
      },
      {
        id: "pet-2",
        components: [
          { type: "Transform", position: { x: 140, y: 500 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "CanWallClimb", velocity: 1.1 },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null, // excluded so climb can win
            nearbyPets: [{ id: "pet-1", position: { x: 100, y: 500 }, distance: 40 }],
            nearbyClimbables: [{ id: "wall-a", position: { x: 120, y: 300 }, distance: Math.hypot(20, 200) }],
            self: { grounded: false, climbing: false, intent: "idle" as const },
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

  it("is deterministic for the same seed", () => {
    const a = makeStore();
    const b = makeStore();

    runBehaviorDecisionSystem(a, createManualClock(0), createSeededRandom(42), BOUNDS);
    runBehaviorDecisionSystem(b, createManualClock(0), createSeededRandom(42), BOUNDS);

    expect(a.getComponent("pet", "BehaviorDecisionToken")?.kind)
      .toBe(b.getComponent("pet", "BehaviorDecisionToken")?.kind);
    expect(a.getComponent("pet", "BehaviorDecisionState")?.reason)
      .toBe(b.getComponent("pet", "BehaviorDecisionState")?.reason);
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

  it("materializes a request-jump token by creating JumpActionState as requested", () => {
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
      "approach-pet",
      "flee-from-pet",
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
      const decision = world.getComponent("pet-c", "BehaviorDecisionState");
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
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null, // no seek-user candidate
            nearbyPets: [],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
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
      runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(seed * 1013 + 7), BOUNDS);
      const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
      counts[kind] = (counts[kind] ?? 0) + 1;
    }

    // T=0.4; theoretical softmax probabilities (calculated from scores above)
    const theoretical: Record<string, number> = {
      "wander-near": 338,
      "wander-far":  393,
      "idle-stay":   270,
    };
    const tolerance = SAMPLES * 0.05; // ±50

    for (const [kind, expected] of Object.entries(theoretical)) {
      expect(counts[kind] ?? 0).toBeGreaterThanOrEqual(expected - tolerance);
      expect(counts[kind] ?? 0).toBeLessThanOrEqual(expected + tolerance);
    }
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
        runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(seed * 1013 + 7), BOUNDS);
        const kind = store.getComponent("pet", "BehaviorDecisionToken")?.kind ?? "none";
        counts[kind] = (counts[kind] ?? 0) + 1;
      }
      return Math.max(...Object.values(counts));
    }

    const lowN = dominantCount(0.0);  // T=0.25 → more concentrated
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

  it("stores approach-pet targetPosition at the default body-scaled stop distance from the nearby pet", () => {
    // Pet at (200,200), other at (350,200), distance=150.
    // approach target = other + (self→other unit)·80 = (350 + (-1)·80, 200) = (270, 200).
    // The pet walks from 200→270, stopping 80px short of other (at 350).
    const store = makeNearbyStore({ extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.1 });
    runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);
    const token = store.getComponent("pet", "BehaviorDecisionToken");
    expect(token?.kind).toBe("approach-pet");
    expect(token?.targetPosition?.x).toBeCloseTo(270, 0);
    expect(token?.targetPosition?.y).toBeCloseTo(200, 0);
    // Target must NOT be on top of the other pet (the old behavior that caused
    // pets to immediately collide after approaching).
    expect(token?.targetPosition?.x).toBeLessThan(350);
  });

  it("scales social approach distance from the pet body width", () => {
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
    expect(token?.targetPosition?.x).toBeCloseTo(250, 0);
  });

  it("scales flee distance from the pet body width", () => {
    const store = createComponentStore([
      { id: "other-pet", components: [{ type: "Transform", position: { x: 650, y: 200 } }] },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 500, y: 200 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 38 },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "WandersOnArrival", arrivalRadius: 16 },
          {
            type: "Perception" as const,
            userAnchor: null,
            nearbyPets: [{ id: "other-pet", position: { x: 650, y: 200 }, distance: 150 }],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
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

  // Regression: when two pets are already within social distance, approach-pet
  // should NOT be a candidate. Previously approach-pet always targeted the
  // other pet's centre, which made any close pair walk into each other and
  // get stuck in a collision/engage/approach oscillation.
  it("does not emit approach-pet when the nearby pet is already within social distance", () => {
    const store = createComponentStore([
      { id: "other-pet", components: [{ type: "Transform", position: { x: 270, y: 200 } }] },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          { type: "IntentState", intent: "idle" as const },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "Perception" as const,
            userAnchor: null,
            // distance = 70 < default body-scaled stop distance (80)
            nearbyPets: [{ id: "other-pet", position: { x: 270, y: 200 }, distance: 70 }],
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          {
            type: "Personality" as const,
            openness: 0.5, conscientiousness: 0.4,
            extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.1,
          },
        ],
      },
    ]);

    // High-E high-A would normally make approach-pet dominant. With the close-
    // distance gate, it must not appear regardless of seed.
    for (let seed = 0; seed < 50; seed++) {
      const fresh = createComponentStore([
        { id: "other-pet", components: [{ type: "Transform", position: { x: 270, y: 200 } }] },
        {
          id: "pet",
          components: [
            { type: "Transform", position: { x: 200, y: 200 } },
            { type: "IntentState", intent: "idle" as const },
            { type: "MotionTarget", targetEntityId: null, targetPosition: null },
            {
              type: "Perception" as const,
              userAnchor: null,
              nearbyPets: [{ id: "other-pet", position: { x: 270, y: 200 }, distance: 70 }],
              nearbyClimbables: [],
              self: { grounded: false, climbing: false, intent: "idle" as const },
            },
            {
              type: "Personality" as const,
              openness: 0.5, conscientiousness: 0.4,
              extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.1,
            },
          ],
        },
      ]);
      runBehaviorDecisionSystem(fresh, createManualClock(0), createSeededRandom(seed * 1013 + 7), BOUNDS);
      const kind = fresh.getComponent("pet", "BehaviorDecisionToken")?.kind;
      expect(kind).not.toBe("approach-pet");
    }
    // Silence unused-var lint on the outer `store` variable.
    expect(store.getComponent("pet", "Perception")?.nearbyPets[0].distance).toBe(70);
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
    runBehaviorPlanningSystem(store, createManualClock(0));
    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toEqual({ x: 250, y: 200 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });

  it("materializes a flee-from-pet token into MotionTarget with intent=active", () => {
    const store = makeSocialTokenStore("flee-from-pet", { x: 100, y: 200 });
    runBehaviorPlanningSystem(store, createManualClock(0));
    const motion = store.getComponent("pet", "MotionTarget");
    expect(motion?.targetEntityId).toBeNull();
    expect(motion?.targetPosition).toEqual({ x: 100, y: 200 });
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
    expect(store.getComponent("pet", "BehaviorDecisionToken")?.consumed).toBe(true);
  });
});
