import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runWorkingBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/personalities/registry";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };

/** A roll that never clears any pacing chance: the pet always holds its pose. */
function neverPaces(): RandomSource {
  return { next: () => 0.99 };
}

/** A roll that clears every pacing chance: the pet always walks. */
function alwaysPaces(): RandomSource {
  return { next: () => 0 };
}

/**
 * Scripted rolls, in the order the system draws them: pace check, then the
 * personality-vs-tool pose roll, then the hold jitter. The last value repeats.
 */
function rolls(...values: number[]): RandomSource {
  let index = 0;
  return {
    next: () => values[Math.min(index++, values.length - 1)] ?? 0.5,
  };
}

function makeStore(opts: {
  status: "working" | "idle";
  conscientiousness?: number;
  extraversion?: number;
  neuroticism?: number;
  openness?: number;
  catalogId?: PetPersonalityId;
  motionTarget?: { x: number; y: number } | null;
  existingClaim?: { source: "agent-event" | "autonomous"; expiresAt: number };
  toolActivity?: { family: "study" | "edit" | "run" | null; at: number };
}) {
  const components: import("@pets-driven/pet-engine/core/components").Component[] = [
    { type: "AgentTaskState", status: opts.status, since: 0 },
    {
      type: "Personality",
      ...(opts.catalogId ? { catalogId: opts.catalogId } : {}),
      openness: opts.openness ?? 0.5,
      conscientiousness: opts.conscientiousness ?? 0.5,
      extraversion: opts.extraversion ?? 0.5,
      agreeableness: 0.5,
      neuroticism: opts.neuroticism ?? 0.3,
    },
    { type: "Steering", mode: "pursue" as const },
    {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: opts.motionTarget ?? null,
    },
    { type: "Transform", position: { x: 500, y: 500 } },
    {
      type: "PhysicsBody",
      width: 32,
      height: 48,
      shape: "rectangle" as const,
    },
  ];

  if (opts.toolActivity) {
    components.push({
      type: "AgentToolActivity",
      family: opts.toolActivity.family,
      at: opts.toolActivity.at,
    });
  }

  if (opts.existingClaim) {
    components.push({
      type: "BehaviorDecisionState",
      source: opts.existingClaim.source,
      decidedAt: 0,
      expiresAt: opts.existingClaim.expiresAt,
      reason: "test-claim",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });
  }

  return createComponentStore([{ id: "pet", components }]);
}

/** How many of `samples` re-decisions ended in the pacing beat. */
function countPaceBeats(catalogId: PetPersonalityId, samples: number): number {
  const random = createSeededRandom(7);
  let paced = 0;

  for (let i = 0; i < samples; i += 1) {
    const store = makeStore({ status: "working", catalogId });
    runWorkingBehaviorSystem(store, createManualClock(100), random, BOUNDS);
    if (store.getComponent("pet", "BehaviorDecisionState")?.reason === "working-wander") {
      paced += 1;
    }
  }

  return paced;
}

describe("runWorkingBehaviorSystem", () => {
  it("does nothing when status is not working", () => {
    const store = makeStore({
      status: "idle",
      conscientiousness: 0.2,
      extraversion: 0.8,
    });
    runWorkingBehaviorSystem(store, createManualClock(100), createSeededRandom(42), BOUNDS);
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("does nothing when motion target is already set", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
      motionTarget: { x: 700, y: 500 },
    });
    runWorkingBehaviorSystem(store, createManualClock(100), createSeededRandom(42), BOUNDS);
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 700,
      y: 500,
    });
  });

  it("does nothing when an active claim holds (agent-event)", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
      existingClaim: { source: "agent-event", expiresAt: 5000 },
    });
    runWorkingBehaviorSystem(store, createManualClock(100), createSeededRandom(42), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("test-claim");
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
  });

  it("focused pet (high C) claims working-focus without a motion target", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.85,
      extraversion: 0.45,
    });
    runWorkingBehaviorSystem(store, createManualClock(100), neverPaces(), BOUNDS);
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-focus");
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
  });

  it("can reselect working behavior after a working collision expression is written", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.85,
      extraversion: 0.45,
      existingClaim: { source: "autonomous", expiresAt: 100 },
    });
    store.setComponent("pet", {
      type: "PetExpressionState",
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 100,
      expiresAt: 700,
    });

    runWorkingBehaviorSystem(store, createManualClock(100), neverPaces(), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-focus");
    expect(store.getComponent("pet", "PetExpressionState")?.label).toBe("!");
  });

  it("a pacing roll picks a wander-near target", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
    });
    runWorkingBehaviorSystem(store, createManualClock(100), alwaysPaces(), BOUNDS);
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).not.toBeNull();
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-wander");
    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
  });

  it("respects an expired claim (fires again after cooldown)", () => {
    const store = makeStore({
      status: "working",
      conscientiousness: 0.2,
      extraversion: 0.8,
      existingClaim: { source: "autonomous", expiresAt: 50 },
    });
    runWorkingBehaviorSystem(store, createManualClock(100), alwaysPaces(), BOUNDS);
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).not.toBeNull();
  });

  // The point of the working styles: the state the user watches longest has to
  // look different per personality instead of one shared standing pose.
  it.each([
    ["steady", "working-focus"],
    ["mischievous", "working-tinker"],
    ["shrewd", "working-ponder"],
    ["skittish", "working-fuss"],
    ["lazy", "working-loaf"],
  ] as const)("%s holds its own working pose", (catalogId, reason) => {
    const store = makeStore({ status: "working", catalogId });
    runWorkingBehaviorSystem(store, createManualClock(100), neverPaces(), BOUNDS);
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(reason);
  });

  it("a diligent pet holds its pose far longer than a restless one", () => {
    const steady = makeStore({ status: "working", catalogId: "steady" });
    const mischievous = makeStore({ status: "working", catalogId: "mischievous" });
    const clock = createManualClock(100);

    runWorkingBehaviorSystem(steady, clock, neverPaces(), BOUNDS);
    runWorkingBehaviorSystem(mischievous, clock, neverPaces(), BOUNDS);

    const steadyHold = steady.getComponent("pet", "BehaviorDecisionState")?.expiresAt ?? 0;
    const mischievousHold =
      mischievous.getComponent("pet", "BehaviorDecisionState")?.expiresAt ?? 0;
    expect(steadyHold).toBeGreaterThan(mischievousHold);
  });

  // Tool hooks say what the agent is actually doing; the pet acts that out
  // instead of miming an unrelated loop. steady's own pose is working-focus, so
  // any other pose here can only have come from the tool.
  it.each([
    ["study", "working-ponder"],
    ["edit", "working-tinker"],
    ["run", "working-focus"],
  ] as const)("acts out the agent's %s tool work", (family, reason) => {
    const store = makeStore({
      status: "working",
      catalogId: "steady",
      toolActivity: { family, at: 100 },
    });

    // Rolls: no pacing, follow the tool, mid jitter.
    runWorkingBehaviorSystem(store, createManualClock(600), rolls(0.99, 0.1, 0.5), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(reason);
  });

  it("keeps its own pose when the roll falls outside the personality's tool-follow", () => {
    const store = makeStore({
      status: "working",
      catalogId: "lazy",
      toolActivity: { family: "edit", at: 100 },
    });

    // lazy follows the agent only 30% of the time — a 0.8 roll is its own beat.
    runWorkingBehaviorSystem(store, createManualClock(600), rolls(0.99, 0.8, 0.5), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-loaf");
  });

  /** Codex reports no tool name, so the pulse carries no family to act out. */
  it("falls back to the personality pose when the agent named no tool", () => {
    const store = makeStore({
      status: "working",
      catalogId: "skittish",
      toolActivity: { family: null, at: 100 },
    });

    runWorkingBehaviorSystem(store, createManualClock(600), rolls(0.99, 0, 0.5), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-fuss");
  });

  /** A long gap between tools means the last one no longer describes anything. */
  it("stops acting out a tool once its pulse goes stale", () => {
    const store = makeStore({
      status: "working",
      catalogId: "steady",
      toolActivity: { family: "study", at: 100 },
    });

    runWorkingBehaviorSystem(store, createManualClock(30_000), rolls(0.99, 0, 0.5), BOUNDS);

    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe("working-focus");
  });

  it("a restless pet paces far more often than a diligent one", () => {
    const samples = 200;
    expect(countPaceBeats("mischievous", samples)).toBeGreaterThan(
      countPaceBeats("steady", samples),
    );
    // Even the restless one still spends most of its time working.
    expect(countPaceBeats("mischievous", samples)).toBeLessThan(samples);
  });
});
