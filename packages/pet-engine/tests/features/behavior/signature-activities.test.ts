import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
  runFeintProgressSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 960, height: 540 };

function decisionStore(catalogId: PetPersonalityId, userX = 260) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [{ type: "UserAnchor" }, { type: "Transform", position: { x: userX, y: 500 } }],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 500 } },
        { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
        { type: "WalkingTag" },
        { type: "CanJump", impulse: 8 },
        { type: "Steering", mode: "stand" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        {
          type: "ContactState",
          grounded: true,
          climbableSurfaceId: null,
          climbableSurfacePosition: null,
        },
        {
          type: "Perception",
          userAnchor: {
            id: "user-anchor",
            position: { x: userX, y: 500 },
            distance: Math.abs(userX - 200),
          },
          nearbyPets: [],
          nearbyClimbables: [],
          self: { grounded: true, climbing: false, mode: "stand" },
        },
        {
          type: "Personality",
          catalogId,
          openness: 0.5,
          conscientiousness: 0.5,
          extraversion: 0.5,
          agreeableness: 0.5,
          neuroticism: 0.2,
        },
        { type: "Drives", social: 0.3, energy: 0.6, curiosity: 0.2 },
      ],
    },
  ]);
}

function probability(store: ReturnType<typeof decisionStore>, kind: string): number {
  return (
    store
      .getComponent("pet", "BehaviorDecisionToken")
      ?.selectionTrace?.candidates.find((candidate) => candidate.kind === kind)?.probability ?? 0
  );
}

function signatureProbability(catalogId: PetPersonalityId, kind: string, userX = 260) {
  const store = decisionStore(catalogId, userX);
  runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), BOUNDS);
  return probability(store, kind);
}

function stationaryActivityStore(
  kind:
    | "nap"
    | "meditate"
    | "keep-watch"
    | "peek"
    | "inspect"
    | "follow-routine"
    | "offer-comfort"
    | "stand-lookout",
) {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "Steering", mode: "stand" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "Drives", social: 0.3, energy: 0.2, curiosity: 0.2 },
        { type: "MoodState", valence: -0.2, arousal: 0.7, confidence: 0.4 },
        { type: "RecentExperienceMemory", entries: [] },
        {
          type: "BehaviorDecisionToken",
          kind,
          decidedAt: 0,
          consumed: false,
          activityDurationMs: 8_000,
        },
      ],
    },
  ]);
}

describe("personality signature activities", () => {
  it("makes each target catalog strongly prefer its own signature activity", () => {
    expect(signatureProbability("lazy", "nap")).toBeGreaterThan(
      signatureProbability("playful", "nap"),
    );
    expect(signatureProbability("zen", "meditate")).toBeGreaterThan(
      signatureProbability("gentle", "meditate"),
    );
    expect(signatureProbability("mischievous", "play-feint")).toBeGreaterThan(
      signatureProbability("curious", "play-feint"),
    );
    expect(signatureProbability("attentive", "keep-watch")).toBeGreaterThan(
      signatureProbability("gentle", "keep-watch"),
    );
    expect(signatureProbability("reserved", "peek", 500)).toBeGreaterThan(
      signatureProbability("curious", "peek", 500),
    );
    expect(signatureProbability("aloof", "withdraw")).toBeGreaterThan(
      signatureProbability("reserved", "withdraw"),
    );
    expect(signatureProbability("playful", "play-romp")).toBeGreaterThan(
      signatureProbability("feisty", "play-romp"),
    );
    expect(signatureProbability("curious", "inspect")).toBeGreaterThan(
      signatureProbability("reserved", "inspect"),
    );
    expect(signatureProbability("steady", "follow-routine")).toBeGreaterThan(
      signatureProbability("gentle", "follow-routine"),
    );
    expect(signatureProbability("feisty", "strut")).toBeGreaterThan(
      signatureProbability("playful", "strut"),
    );
    expect(signatureProbability("gentle", "offer-comfort")).toBeGreaterThan(
      signatureProbability("attentive", "offer-comfort"),
    );
    expect(signatureProbability("skittish", "stand-lookout")).toBeGreaterThan(
      signatureProbability("reserved", "stand-lookout"),
    );
  });

  it("materializes a nap as a long sleepy rest that restores energy", () => {
    const store = stationaryActivityStore("nap");
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "expressive",
      mood: "sleepy",
      emote: "zzz",
      expiresAt: 8_000,
    });
    expect(store.getComponent("pet", "Drives")?.energy).toBeCloseTo(0.5);
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "rested",
    );
  });

  it("materializes meditation as a self-soothing stationary activity", () => {
    const store = stationaryActivityStore("meditate");
    const arousalBefore = store.getComponent("pet", "MoodState")!.arousal;
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "expressive",
      mood: "happy",
      // Quiet "···" rather than a sparkle, so meditating stops looking like
      // another greet.
      emote: "dots",
    });
    expect(store.getComponent("pet", "MoodState")!.arousal).toBeLessThan(arousalBefore);
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "self-soothed",
    );
  });

  it("keeps an attentive pet close while satisfying some social need", () => {
    const store = stationaryActivityStore("keep-watch");
    const socialBefore = store.getComponent("pet", "Drives")!.social;
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      mood: "love",
      // Watchful, not doting — keeps it distinct from offer-comfort's heart.
      emote: "dots",
    });
    expect(store.getComponent("pet", "Drives")!.social).toBeLessThan(socialBefore);
  });

  it("lets a reserved pet peek without approaching", () => {
    const store = stationaryActivityStore("peek");
    const curiosityBefore = store.getComponent("pet", "Drives")!.curiosity;
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      mood: "thinking",
      // Passive watching; the pointed "?" now belongs to inspect alone.
      emote: "dots",
    });
    expect(store.getComponent("pet", "Drives")!.curiosity).toBeLessThan(curiosityBefore);
  });

  it("moves an aloof pet away without presenting the retreat as fear", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          {
            type: "BehaviorDecisionToken",
            kind: "withdraw",
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 40, y: 500 },
            activityDurationMs: 3_500,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 40,
      y: 500,
    });
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      mood: "thinking",
      emote: "none",
    });
  });

  it.each([
    ["inspect", "thinking", "question"],
    ["follow-routine", "working", "none"],
    ["offer-comfort", "love", "heart"],
    ["stand-lookout", "confused", "exclaim"],
  ] as const)("materializes %s as its exclusive held pose", (kind, mood, emote) => {
    const store = stationaryActivityStore(kind);
    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      mood,
      emote,
    });
  });

  it("lets signature poses satisfy the need expressed by their personality", () => {
    const inspect = stationaryActivityStore("inspect");
    runBehaviorPlanningSystem(inspect, createManualClock(0));
    expect(inspect.getComponent("pet", "Drives")!.curiosity).toBeLessThan(0.2);

    const routine = stationaryActivityStore("follow-routine");
    runBehaviorPlanningSystem(routine, createManualClock(0));
    expect(routine.getComponent("pet", "Drives")!.energy).toBeGreaterThan(0.2);

    const comfort = stationaryActivityStore("offer-comfort");
    runBehaviorPlanningSystem(comfort, createManualClock(0));
    expect(comfort.getComponent("pet", "Drives")!.social).toBeLessThan(0.3);
  });

  it.each([
    ["lounge", "sleepy", "zzz"],
    ["center", "happy", "dots"],
    ["appraise", "thinking", "dots"],
    ["startle-scan", "confused", "sweat"],
    ["nurture", "love", "heart"],
  ] as const)("materializes the second signature pose %s as a held cue", (kind, mood, emote) => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "Drives", social: 0.5, energy: 0.3, curiosity: 0.5 },
          {
            type: "BehaviorDecisionToken",
            kind,
            decidedAt: 0,
            consumed: false,
            activityDurationMs: 8_000,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "expressive",
      mood,
      emote,
    });
  });

  it("lets a lazy lounge restore energy and an appraisal scratch curiosity", () => {
    const lounge = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "Drives", social: 0.3, energy: 0.2, curiosity: 0.2 },
          {
            type: "BehaviorDecisionToken",
            kind: "lounge",
            decidedAt: 0,
            consumed: false,
            activityDurationMs: 8_000,
          },
        ],
      },
    ]);
    runBehaviorPlanningSystem(lounge, createManualClock(0));
    expect(lounge.getComponent("pet", "Drives")!.energy).toBeGreaterThan(0.2);

    const appraise = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "Drives", social: 0.3, energy: 0.6, curiosity: 0.5 },
          {
            type: "BehaviorDecisionToken",
            kind: "appraise",
            decidedAt: 0,
            consumed: false,
            activityDurationMs: 8_000,
          },
        ],
      },
    ]);
    runBehaviorPlanningSystem(appraise, createManualClock(0));
    expect(appraise.getComponent("pet", "Drives")!.curiosity).toBeLessThan(0.5);
  });

  it("materializes a feisty strut as a deliberate slower walk", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "Drives", social: 0.2, energy: 0.8, curiosity: 0.2 },
          {
            type: "BehaviorDecisionToken",
            kind: "strut",
            decidedAt: 0,
            consumed: false,
            targetPosition: { x: 420, y: 500 },
            activityDurationMs: 4_500,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, createManualClock(0));

    expect(store.getComponent("pet", "Steering")?.mode).toBe("pursue");
    expect(store.getComponent("pet", "MotionTarget")).toMatchObject({
      targetPosition: { x: 420, y: 500 },
      speedFactor: 0.75,
    });
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      mood: "excited",
      emote: "sparkle",
    });
  });

  it("runs a feint through approach, retreat, and a playful finish", () => {
    const clock = createManualClock(0);
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [{ type: "Transform", position: { x: 260, y: 500 } }],
      },
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 200, y: 500 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
          { type: "Steering", mode: "stand" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: null },
          { type: "MoodState", valence: 0, arousal: 0.4, confidence: 0.6 },
          { type: "RecentExperienceMemory", entries: [] },
          {
            type: "BehaviorDecisionState",
            source: "autonomous",
            decidedAt: 0,
            expiresAt: 4_000,
            reason: "play-feint",
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
          {
            type: "BehaviorDecisionToken",
            kind: "play-feint",
            decidedAt: 0,
            consumed: false,
            targetEntityId: "user-anchor",
            targetPosition: { x: 260, y: 500 },
            activityDurationMs: 4_000,
          },
        ],
      },
    ]);

    runBehaviorPlanningSystem(store, clock);
    expect(store.getComponent("pet", "FeintState")?.phase).toBe("approach");
    expect(store.getComponent("pet", "MotionTarget")?.targetEntityId).toBe("user-anchor");

    clock.advanceBy(1_200);
    runFeintProgressSystem(store, clock, BOUNDS);
    expect(store.getComponent("pet", "FeintState")?.phase).toBe("retreat");
    expect(store.getComponent("pet", "MotionTarget")?.targetEntityId).toBeNull();
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition?.x).toBeLessThan(200);
    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "signature",
      mood: "excited",
      emote: "exclaim",
    });

    clock.advanceBy(2_800);
    runFeintProgressSystem(store, clock, BOUNDS);
    expect(store.getComponent("pet", "FeintState")).toBeUndefined();
    expect(store.getComponent("pet", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet", "RecentExperienceMemory")?.entries.at(-1)?.kind).toBe(
      "played",
    );
  });
});
