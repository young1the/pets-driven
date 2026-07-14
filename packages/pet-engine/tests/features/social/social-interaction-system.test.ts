import {
  type ComponentStore,
  createComponentStore,
} from "@pets-driven/pet-engine/core/component-store";
import type { Component, PersonalityComponent } from "@pets-driven/pet-engine/core/components";
import {
  CHASE_SWAP_MS,
  CHAT_TURN_MS,
  GREET_TIMEOUT_MS,
  PHASE_DURATIONS,
  runSocialInteractionSystem,
} from "@pets-driven/pet-engine/features/social/systems";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

const BOUNDS = { x: 0, y: 0, width: 960, height: 540 };

// Deterministic random stubs so accept/decline/emit decisions are not
// seed-dependent. next() = 0 always passes probability gates; 0.99 fails them.
const ALWAYS: RandomSource = { next: () => 0 };
const NEVER: RandomSource = { next: () => 0.99 };

const AGREEABLE: PersonalityComponent = {
  type: "Personality",
  openness: 0.6,
  conscientiousness: 0.5,
  extraversion: 0.8,
  agreeableness: 0.9,
  neuroticism: 0.1,
};
const RESERVED: PersonalityComponent = {
  type: "Personality",
  openness: 0.3,
  conscientiousness: 0.5,
  extraversion: 0.2,
  agreeableness: 0.3,
  neuroticism: 0.85,
};

function socialPet(
  _id: string,
  x: number,
  personality: PersonalityComponent,
  social = 0.5,
): Component[] & { id?: never } {
  return [
    { type: "CanSocialize" },
    { type: "Transform", position: { x, y: 500 } },
    { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
    { type: "Steering", mode: "stand" },
    { type: "MotionTarget", targetEntityId: null, targetPosition: null },
    {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    },
    { type: "SpeechState", speech: null, expiresAt: null },
    { type: "Drives", social, energy: 1, curiosity: 0.2 },
    personality,
  ];
}

function makeStore(
  a: PersonalityComponent = AGREEABLE,
  b: PersonalityComponent = AGREEABLE,
  positions: [number, number] = [100, 300],
  social: [number, number] = [0.5, 0.5],
): ComponentStore {
  return createComponentStore([
    { id: "pet-a", components: socialPet("pet-a", positions[0], a, social[0]) },
    { id: "pet-b", components: socialPet("pet-b", positions[1], b, social[1]) },
  ]);
}

function seedSession(
  store: ComponentStore,
  kind: "greet" | "chat" | "chase",
  startedAt: number,
  participantIds: string[] = ["pet-a", "pet-b"],
): void {
  const d = PHASE_DURATIONS[kind];
  store.spawn("sess", [
    {
      type: "SocialSession",
      kind,
      participantIds,
      phase: "approach",
      startedAt,
      endsAt: startedAt + GREET_TIMEOUT_MS + d.play + d.part,
      playStartedAt: null,
      greeted: false,
    },
  ]);
  participantIds.forEach((id, index) => {
    store.setComponent(id, {
      type: "SocialSessionMember",
      sessionId: "sess",
      partnerId: participantIds.find((p) => p !== id) ?? id,
      role: index === 0 ? "initiator" : "responder",
    });
  });
}

function sessionCount(store: ComponentStore): number {
  return store.components("SocialSession").size;
}

describe("SocialInteractionSystem — invites", () => {
  it("forms a session when an agreeable pet accepts an invite", () => {
    const store = makeStore();
    const clock = createManualClock(0);
    store.setComponent("pet-b", {
      type: "SocialInvite",
      fromId: "pet-a",
      kind: "greet",
      createdAt: 0,
      expiresAt: 1_200,
    });

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(sessionCount(store)).toBe(1);
    expect(store.getComponent("pet-a", "SocialSessionMember")).toMatchObject({
      role: "initiator",
      partnerId: "pet-b",
    });
    expect(store.getComponent("pet-b", "SocialSessionMember")).toMatchObject({
      role: "responder",
      partnerId: "pet-a",
    });
    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
  });

  it("declines an invite for a reserved pet and shows a shrug", () => {
    const store = makeStore(AGREEABLE, RESERVED);
    const clock = createManualClock(0);
    store.setComponent("pet-b", {
      type: "SocialInvite",
      fromId: "pet-a",
      kind: "greet",
      createdAt: 0,
      expiresAt: 1_200,
    });

    runSocialInteractionSystem(store, clock, NEVER, BOUNDS, 16);

    expect(sessionCount(store)).toBe(0);
    expect(store.getComponent("pet-b", "SocialSessionMember")).toBeUndefined();
    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
    expect(store.getComponent("pet-b", "PetExpressionState")).toMatchObject({
      source: "social",
      mood: "confused",
    });
  });

  it("drops an expired invite without forming a session", () => {
    const store = makeStore();
    const clock = createManualClock(2_000);
    store.setComponent("pet-b", {
      type: "SocialInvite",
      fromId: "pet-a",
      kind: "greet",
      createdAt: 0,
      expiresAt: 1_200,
    });

    // NEVER random so no fresh invite is emitted in the same tick — the
    // assertion is purely that the expired invite is dropped.
    runSocialInteractionSystem(store, clock, NEVER, BOUNDS, 16);

    expect(sessionCount(store)).toBe(0);
    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
  });

  it("emits then accepts an invite over two ticks for eligible pets", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 150], [0.9, 0.9]);
    const clock = createManualClock(0);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    // Only the lexicographically smaller id (pet-a) opens the invite.
    expect(store.getComponent("pet-b", "SocialInvite")).toMatchObject({
      fromId: "pet-a",
    });

    clock.advanceBy(16);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(sessionCount(store)).toBe(1);
    expect(store.getComponent("pet-a", "SocialSessionMember")).toBeDefined();
    expect(store.getComponent("pet-b", "SocialSessionMember")).toBeDefined();
  });
});

describe("SocialInteractionSystem — greet choreography", () => {
  it("saunters both pets together during the greet phase", () => {
    const store = makeStore();
    const clock = createManualClock(0);
    seedSession(store, "greet", 0);
    clock.advanceBy(100);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    const a = store.getComponent("pet-a", "MotionTarget");
    const b = store.getComponent("pet-b", "MotionTarget");
    expect(store.getComponent("pet-a", "Steering")?.mode).toBe("pursue");
    expect(a?.targetPosition?.x).toBeGreaterThan(100); // moving toward pet-b (300)
    expect(b?.targetPosition?.x).toBeLessThan(300); // moving toward pet-a (100)
    // Walking up for a hello is a saunter, not a sprint.
    expect(a?.speedFactor).toBeLessThan(1);
    expect(b?.speedFactor).toBeLessThan(1);
  });

  it("stops, greets and shows hearts once the pets have met", () => {
    // Seed the pets already within meeting distance so play begins immediately.
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 160]);
    const clock = createManualClock(0);
    seedSession(store, "greet", 0);
    clock.advanceBy(100);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(store.getComponent("sess", "SocialSession")?.phase).toBe("play");
    expect(store.getComponent("pet-a", "Steering")?.mode).toBe("stand");
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition).toBeNull();
    expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
      source: "social",
      mood: "love",
      emote: "heart",
    });
    expect(store.getComponent("pet-a", "SpeechState")?.speech).not.toBeNull();
    expect(store.getComponent("sess", "SocialSession")?.greeted).toBe(true);
  });

  it("spreads a stacked pair apart instead of standing on top of each other", () => {
    // Pets meet almost on the same spot (10px apart, bodies 32 wide).
    const store = makeStore(AGREEABLE, AGREEABLE, [200, 210]);
    const clock = createManualClock(0);
    seedSession(store, "greet", 0);
    clock.advanceBy(100);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    const a = store.getComponent("pet-a", "MotionTarget")?.targetPosition;
    const b = store.getComponent("pet-b", "MotionTarget")?.targetPosition;
    // Both get a spacing target (not a stand-still), and the targets clear a
    // full body width so the bodies no longer overlap.
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs((a?.x ?? 0) - (b?.x ?? 0))).toBeGreaterThanOrEqual(32);
    // Left pet stays left; nobody crosses through the other.
    expect(a?.x).toBeLessThan(b?.x ?? 0);
  });

  it("arranges a stacked trio into a spaced row", () => {
    const store = createComponentStore([
      { id: "pet-a", components: socialPet("pet-a", 300, AGREEABLE, 0.9) },
      { id: "pet-b", components: socialPet("pet-b", 308, AGREEABLE, 0.9) },
      { id: "pet-c", components: socialPet("pet-c", 316, AGREEABLE, 0.9) },
    ]);
    const clock = createManualClock(0);
    seedSession(store, "greet", 0, ["pet-a", "pet-b", "pet-c"]);
    clock.advanceBy(100);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    const xs = ["pet-a", "pet-b", "pet-c"].map(
      (id) => store.getComponent(id, "MotionTarget")?.targetPosition?.x ?? null,
    );
    expect(xs.every((x) => x !== null)).toBe(true);
    const sorted = [...(xs as number[])].sort((l, r) => l - r);
    // Every neighbour clears a body width.
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(32);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(32);
  });

  it("enters play via the greet timeout when the pets never manage to meet", () => {
    const store = makeStore();
    const clock = createManualClock(0);
    seedSession(store, "greet", 0);
    clock.advanceBy(GREET_TIMEOUT_MS + 100);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(store.getComponent("sess", "SocialSession")?.phase).toBe("play");
    expect(store.getComponent("pet-a", "Steering")?.mode).toBe("stand");
  });

  it("tears the session down and relieves the social drive when it ends", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 160], [0.8, 0.8]);
    const clock = createManualClock(0);
    seedSession(store, "greet", 0);

    // Meet immediately → play begins at t=100 and endsAt tightens to
    // 100 + play + part.
    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    const d = PHASE_DURATIONS.greet;
    clock.advanceBy(d.play + d.part + 100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(sessionCount(store)).toBe(0);
    expect(store.getComponent("pet-a", "SocialSessionMember")).toBeUndefined();
    expect(store.getComponent("pet-b", "SocialSessionMember")).toBeUndefined();
    // social drive relieved from 0.8 by 0.55 → ~0.25
    expect(store.getComponent("pet-a", "Drives")?.social).toBeCloseTo(0.25, 5);
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "social",
      reason: "socialized",
    });
  });
});

describe("SocialInteractionSystem — chase choreography", () => {
  it("has the initiator chase first and swaps roles over time", () => {
    const store = makeStore();
    const clock = createManualClock(0);
    seedSession(store, "chase", 0);

    // Early: initiator (pet-a) chases, responder (pet-b) flees.
    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition?.x).toBe(300); // toward pet-b
    expect(store.getComponent("pet-b", "MotionTarget")?.targetPosition?.x).toBeGreaterThan(300); // fleeing right, away from pet-a

    // After a swap window, roles flip: pet-b chases pet-a.
    clock.advanceBy(CHASE_SWAP_MS + 100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(store.getComponent("pet-b", "MotionTarget")?.targetPosition?.x).toBe(100); // toward pet-a
    expect(store.getComponent("pet-a", "MotionTarget")?.targetPosition?.x).toBeLessThan(100); // fleeing left
  });

  it("catching the runner swaps roles early and fires a one-shot tag cue", () => {
    // Pets seeded within the catch radius (centers 20px apart, 32px bodies).
    const store = makeStore(AGREEABLE, AGREEABLE, [200, 220]);
    const clock = createManualClock(0);
    seedSession(store, "chase", 0);

    // t=100, well inside CHASE_SWAP_MS: only a catch could swap this early.
    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    // pet-a (initiator) caught pet-b → it speaks the tag line, and roles have
    // already flipped so pet-b now chases pet-a.
    expect(store.getComponent("pet-a", "SpeechState")?.speech).not.toBeNull();
    expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
      mood: "excited",
      emote: "sparkle",
    });
    expect(store.getComponent("sess", "SocialSession")?.chaseSwaps).toBe(1);
    expect(store.getComponent("pet-b", "MotionTarget")?.targetPosition?.x).toBe(200); // now chasing pet-a

    // A lingering overlap on the next tick must not re-fire the cue (cooldown).
    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(store.getComponent("sess", "SocialSession")?.chaseSwaps).toBe(1);
  });

  it("re-catches once the catch cooldown has lapsed", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [200, 220]);
    const clock = createManualClock(0);
    seedSession(store, "chase", 0);

    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(store.getComponent("sess", "SocialSession")?.chaseSwaps).toBe(1);

    // Past the 700ms cue cooldown, still overlapping → another catch/swap.
    clock.advanceBy(800);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(store.getComponent("sess", "SocialSession")?.chaseSwaps).toBe(2);
  });
});

describe("SocialInteractionSystem — interruption", () => {
  it("ends a session when a higher-priority claim grabs a participant", () => {
    const store = makeStore();
    const clock = createManualClock(0);
    seedSession(store, "greet", 0);
    clock.advanceBy(100);
    store.setComponent("pet-a", {
      type: "BehaviorDecisionState",
      source: "agent-event",
      decidedAt: 100,
      expiresAt: 5_000,
      reason: "task.waiting",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(sessionCount(store)).toBe(0);
    expect(store.getComponent("pet-a", "SocialSessionMember")).toBeUndefined();
    expect(store.getComponent("pet-b", "SocialSessionMember")).toBeUndefined();
  });
});

describe("SocialInteractionSystem — collision no longer interrupts (B1)", () => {
  it("keeps a session alive when a collision claim lands on a participant", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 160]);
    const clock = createManualClock(0);
    seedSession(store, "chat", 0);
    clock.advanceBy(100);
    store.setComponent("pet-a", {
      type: "BehaviorDecisionState",
      source: "collision",
      decidedAt: 100,
      expiresAt: 1_100,
      reason: "entity overlap",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    });

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(sessionCount(store)).toBe(1);
    expect(store.getComponent("pet-a", "SocialSessionMember")).toBeDefined();
    // The session re-claims the pet, replacing the collision claim.
    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.source).toBe("social");
  });

  it("drops an invite while the target is frozen in collision deliberation", () => {
    const store = makeStore();
    const clock = createManualClock(0);
    store.setComponent("pet-b", {
      type: "SocialInvite",
      fromId: "pet-a",
      kind: "greet",
      createdAt: 0,
      expiresAt: 1_200,
    });
    store.setComponent("pet-b", {
      type: "PendingReaction",
      source: "collision",
      triggeredAt: 0,
      reactsAt: 400,
      context: {},
    });

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(sessionCount(store)).toBe(0);
    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
    // The pending startle is untouched — the pet still gets to react.
    expect(store.getComponent("pet-b", "PendingReaction")).toBeDefined();
  });
});

describe("SocialInteractionSystem — bump-to-greet (B4)", () => {
  function seedBump(store: ComponentStore, id: string, otherId: string, otherX: number) {
    store.setComponent(id, {
      type: "PendingReaction",
      source: "collision",
      triggeredAt: 0,
      reactsAt: 400,
      context: { otherEntityId: otherId, otherPosition: { x: otherX, y: 500 } },
    });
  }

  it("converts a matured mutual bump into a single greet invite", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 130]);
    const clock = createManualClock(500); // past both reactsAt deadlines
    seedBump(store, "pet-a", "pet-b", 130);
    seedBump(store, "pet-b", "pet-a", 100);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    // One invite (a → b), both startles defused, initiator holds the invite claim.
    expect(store.getComponent("pet-b", "SocialInvite")).toMatchObject({
      fromId: "pet-a",
      kind: "greet",
    });
    expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-b", "PendingReaction")).toBeUndefined();
    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "social",
      reason: "social-invite",
    });
    expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
      source: "social",
      mood: "happy",
    });

    // Next tick the invite resolves into a session.
    clock.advanceBy(16);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);
    expect(sessionCount(store)).toBe(1);
  });

  it("leaves the startle in place while deliberation has not matured", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 130]);
    const clock = createManualClock(200); // before reactsAt
    seedBump(store, "pet-a", "pet-b", 130);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
  });

  it("a shy pet never converts its bump and keeps the pending reaction", () => {
    const store = makeStore(RESERVED, AGREEABLE, [100, 130]);
    const clock = createManualClock(500);
    seedBump(store, "pet-a", "pet-b", 130);

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    // RESERVED's bump-invite chance clamps to 0 — the reactive pool
    // (flee/avoid) stays in charge via BehaviorDecisionSystem.
    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
  });

  it("does not convert a bump against a working pet", () => {
    const store = makeStore(AGREEABLE, AGREEABLE, [100, 130]);
    const clock = createManualClock(500);
    seedBump(store, "pet-a", "pet-b", 130);
    store.setComponent("pet-b", {
      type: "AgentTaskState",
      status: "working",
      since: 0,
    });

    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(store.getComponent("pet-b", "SocialInvite")).toBeUndefined();
    expect(store.getComponent("pet-a", "PendingReaction")).toBeDefined();
  });
});

describe("SocialInteractionSystem — group sessions (B10)", () => {
  function agentBusy(_id: string): Component {
    return {
      type: "BehaviorDecisionState",
      source: "agent-event",
      decidedAt: 0,
      expiresAt: 10_000_000,
      reason: "task.waiting",
      lastAutonomousReason: null,
      lastAutonomousAt: null,
    } as Component;
  }

  function trio(): ComponentStore {
    // Three agreeable, lonely pets bunched together.
    return createComponentStore([
      { id: "pet-a", components: socialPet("pet-a", 200, AGREEABLE, 0.9) },
      { id: "pet-b", components: socialPet("pet-b", 230, AGREEABLE, 0.9) },
      { id: "pet-c", components: socialPet("pet-c", 250, AGREEABLE, 0.9) },
    ]);
  }

  it("lets a nearby pet join a live chat and rotates the speech turn over all three", () => {
    const store = trio();
    const clock = createManualClock(0);
    seedSession(store, "chat", 0, ["pet-a", "pet-b"]);

    // Tick 1: the pair meets → play; pet-c is close and willing → it joins.
    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(store.getComponent("sess", "SocialSession")?.phase).toBe("play");
    expect(store.getComponent("sess", "SocialSession")?.participantIds).toEqual([
      "pet-a",
      "pet-b",
      "pet-c",
    ]);
    expect(store.getComponent("pet-c", "SocialSessionMember")?.sessionId).toBe("sess");

    // Over successive turns the single speaker rotates across all three.
    const spoke = new Set<string>();
    for (const id of ["pet-a", "pet-b", "pet-c"]) {
      if (store.getComponent(id, "SpeechState")?.speech) spoke.add(id);
    }
    for (let turn = 0; turn < 3; turn += 1) {
      clock.advanceBy(CHAT_TURN_MS);
      runSocialInteractionSystem(store, clock, NEVER, BOUNDS, 16);
      for (const id of ["pet-a", "pet-b", "pet-c"]) {
        if (store.getComponent(id, "SpeechState")?.speech) spoke.add(id);
      }
    }
    expect(spoke).toEqual(new Set(["pet-a", "pet-b", "pet-c"]));
  });

  it("survives one participant leaving but tears down when only one remains", () => {
    const store = trio();
    const clock = createManualClock(0);
    seedSession(store, "chat", 0, ["pet-a", "pet-b", "pet-c"]);

    // Reach play with all three.
    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, NEVER, BOUNDS, 16);
    expect(store.getComponent("sess", "SocialSession")?.phase).toBe("play");

    // pet-c is claimed away by an agent event → pruned, session lives on.
    store.setComponent("pet-c", agentBusy("pet-c"));
    clock.advanceBy(16);
    runSocialInteractionSystem(store, clock, NEVER, BOUNDS, 16);

    expect(sessionCount(store)).toBe(1);
    expect(store.getComponent("sess", "SocialSession")?.participantIds).toEqual(["pet-a", "pet-b"]);
    expect(store.getComponent("pet-c", "SocialSessionMember")).toBeUndefined();

    // pet-b leaves too → only one left → the session ends.
    store.setComponent("pet-b", agentBusy("pet-b"));
    clock.advanceBy(16);
    runSocialInteractionSystem(store, clock, NEVER, BOUNDS, 16);

    expect(sessionCount(store)).toBe(0);
    expect(store.getComponent("pet-a", "SocialSessionMember")).toBeUndefined();
  });

  it("does not exceed the group size cap", () => {
    // Four already in session, a fifth pet nearby must not be added.
    const store = createComponentStore([
      { id: "pet-a", components: socialPet("pet-a", 200, AGREEABLE, 0.9) },
      { id: "pet-b", components: socialPet("pet-b", 215, AGREEABLE, 0.9) },
      { id: "pet-c", components: socialPet("pet-c", 230, AGREEABLE, 0.9) },
      { id: "pet-d", components: socialPet("pet-d", 245, AGREEABLE, 0.9) },
      { id: "pet-e", components: socialPet("pet-e", 260, AGREEABLE, 0.9) },
    ]);
    const clock = createManualClock(0);
    seedSession(store, "chat", 0, ["pet-a", "pet-b", "pet-c", "pet-d"]);

    clock.advanceBy(100);
    runSocialInteractionSystem(store, clock, ALWAYS, BOUNDS, 16);

    expect(store.getComponent("sess", "SocialSession")?.participantIds).toHaveLength(4);
    expect(store.getComponent("pet-e", "SocialSessionMember")).toBeUndefined();
  });
});
