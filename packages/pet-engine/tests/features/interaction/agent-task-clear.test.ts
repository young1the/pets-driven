import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPettingDetectionSystem } from "@pets-driven/pet-engine/features/behavior/cursor-reaction-systems";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * 5 samples oscillating x over the pet at (0, 0): -10 -> 10 -> -10 -> 10 -> -10.
 * dx signs: +,-,+,- → 3 direction reversals; displacement = 20px. Satisfies
 * PETTING_MIN_REVERSALS(3) and stays under PETTING_MAX_DISPLACEMENT_PX(60).
 */
const STROKE_SAMPLES = [
  { at: 0, position: { x: -10, y: 0 } },
  { at: 100, position: { x: 10, y: 0 } },
  { at: 200, position: { x: -10, y: 0 } },
  { at: 300, position: { x: 10, y: 0 } },
  { at: 400, position: { x: -10, y: 0 } },
];

type PetComponents = Parameters<typeof createComponentStore>[0][number]["components"];

function storeWithStrokedPet(petComponents: PetComponents) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: -10, y: 0 } },
        { type: "CursorState", position: { x: -10, y: 0 }, samples: STROKE_SAMPLES },
      ],
    },
    { id: "user-interaction", components: [] },
    { id: "pet", components: petComponents },
  ]);
}

function pressAt(x: number, y: number) {
  const events = createWorldEventQueue();
  events.push({
    kind: "pointer",
    type: "pointer.down",
    pointerId: 1,
    at: 0,
    position: { x, y },
  });
  return events;
}

/** A tap = a press and release that never crosses the drag threshold. */
function tapAt(x: number, y: number) {
  const events = createWorldEventQueue();
  events.push({ kind: "pointer", type: "pointer.down", pointerId: 1, at: 0, position: { x, y } });
  events.push({ kind: "pointer", type: "pointer.up", pointerId: 1, at: 0, position: { x, y } });
  return events;
}

type AgentTaskStatus = "working" | "waiting" | "completed" | "failed";

function storeWithTappablePet(status: AgentTaskStatus, extra: PetComponents = []) {
  return createComponentStore([
    { id: "user-interaction", components: [{ type: "KeyboardControlTarget", entityId: null }] },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 0, y: 0 } },
        { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
        { type: "PetIdentity", name: "Pet" },
        { type: "CanDrag" },
        { type: "AgentTaskState", status, since: 0 },
        { type: "TaskMovementHold", since: 0 },
        {
          type: "AgentChannelState",
          source: "agent-task",
          status,
          label: status,
          message: null,
          updatedAt: 0,
          expiresAt: null,
        },
        ...extra,
      ],
    },
  ]);
}

describe("petting releases the agent task state", () => {
  it("clears the hold, task state, and channel badge when a settled pet is petted", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
      { type: "AgentTaskState", status: "waiting", since: 0 },
      { type: "TaskMovementHold", since: 0 },
      {
        type: "AgentChannelState",
        source: "agent-task",
        status: "waiting",
        label: "Waiting",
        message: null,
        updatedAt: 0,
        expiresAt: null,
      },
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "TaskMovementHold")).toBeUndefined();
    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
  });

  it("surfaces the personality's own acknowledge cue on a settled release", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
      // "playful" acknowledges "waiting" with an excited sparkle — the release
      // now shows that personality cue instead of a unified heart.
      {
        type: "Personality",
        catalogId: "playful",
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      { type: "AgentTaskState", status: "waiting", since: 0 },
      { type: "TaskMovementHold", since: 0 },
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "acknowledge",
      mood: "excited",
      emote: "sparkle",
    });
  });

  it("clears a live working status too — petting dismisses the report entirely", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
      { type: "AgentTaskState", status: "working", since: 0 },
      {
        type: "AgentChannelState",
        source: "agent-task",
        status: "working",
        label: "Working",
        message: null,
        updatedAt: 0,
        expiresAt: null,
      },
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
    // "working" has no acknowledge beat: the plain petting love reaction stays.
    expect(components.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "petting",
      mood: "love",
      emote: "heart",
    });
  });

  it("leaves a non-agent-task channel badge in place when clearing", () => {
    const components = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
      { type: "AgentTaskState", status: "completed", since: 0 },
      { type: "TaskMovementHold", since: 0 },
      {
        type: "AgentChannelState",
        source: "agent-hook",
        status: "completed",
        label: "Hook done",
        message: null,
        updatedAt: 0,
        expiresAt: null,
      },
    ]);

    runPettingDetectionSystem(components, createManualClock(400));

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")?.source).toBe("agent-hook");
  });

  it("does NOT release the task when the pet is merely pressed", () => {
    const components = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
          { type: "PetIdentity", name: "Pet" },
          { type: "CanControl", speed: 1.4 },
          { type: "CanDrag" },
          { type: "AgentTaskState", status: "waiting", since: 0 },
          { type: "TaskMovementHold", since: 0 },
          {
            type: "AgentChannelState",
            source: "agent-task",
            status: "waiting",
            label: "Waiting",
            message: null,
            updatedAt: 0,
            expiresAt: null,
          },
        ],
      },
      {
        id: "user-interaction",
        components: [{ type: "KeyboardControlTarget", entityId: null }],
      },
    ]);

    runUserInteractionBehaviorSystem(components, pressAt(0, 0), createManualClock(0));

    expect(components.getComponent("pet", "TaskMovementHold")).toBeDefined();
    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe("waiting");
    expect(components.getComponent("pet", "AgentChannelState")?.label).toBe("Waiting");
  });
});

describe("double-clicking releases a settled agent task", () => {
  it.each([
    "waiting",
    "completed",
  ] as const)("clears a %s task, its hold and channel badge on the second quick tap", (status) => {
    const components = storeWithTappablePet(status);

    // First tap arms the gesture; the task is untouched.
    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(0));
    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe(status);

    // Second tap within the double-click window dismisses it.
    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(100));
    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "TaskMovementHold")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")).toBeUndefined();
    expect(components.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "acknowledge",
      mood: "happy",
      emote: "music",
    });
  });

  /**
   * PET-23: the double-click dismissal used to reuse petting's expression, which
   * made the two gestures identical on screen. The dismissal keeps a fixed
   * happy/music cue while the petting release shows the personality's own
   * acknowledge cue, so they stay distinct. This pair of assertions is the guard
   * against them being unified again — if one of them starts failing because the
   * cues match, that is the regression, not a stale expectation.
   */
  it("stays visually distinct from the petting release, which shows the personality cue", () => {
    const dismissed = storeWithTappablePet("completed");
    runUserInteractionBehaviorSystem(dismissed, tapAt(0, 0), createManualClock(0));
    runUserInteractionBehaviorSystem(dismissed, tapAt(0, 0), createManualClock(100));

    // Same status, same acknowledge beat — only the gesture differs. "lazy"
    // acknowledges "completed" with a sleepy/zzz cue, unlike the dismissal's
    // fixed happy/music.
    const petted = storeWithStrokedPet([
      { type: "Transform", position: { x: 0, y: 0 } },
      { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      { type: "PetIdentity", name: "Pet" },
      {
        type: "Personality",
        catalogId: "lazy",
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      { type: "AgentTaskState", status: "completed", since: 0 },
      { type: "TaskMovementHold", since: 0 },
    ]);
    runPettingDetectionSystem(petted, createManualClock(400));

    const dismissCue = dismissed.getComponent("pet", "PetExpressionState");
    const pettingCue = petted.getComponent("pet", "PetExpressionState");

    expect(pettingCue).toMatchObject({ source: "acknowledge", mood: "sleepy", emote: "zzz" });
    expect(dismissCue).toMatchObject({ mood: "happy", emote: "music" });
    expect(dismissCue?.emote).not.toBe(pettingCue?.emote);
    expect(dismissCue?.mood).not.toBe(pettingCue?.mood);
  });

  it("speaks the personality acknowledge line when dismissing a settled task", () => {
    const components = storeWithTappablePet("completed", [
      {
        type: "Personality",
        catalogId: "playful",
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
    ]);

    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(0));
    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(100));

    expect(components.getComponent("pet", "AgentTaskState")).toBeUndefined();
    expect(components.getComponent("pet", "AgentChannelState")?.message).toBeTruthy();
  });

  it("does NOT release a live working task on double-click (petting only)", () => {
    const components = storeWithTappablePet("working");

    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(0));
    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(100));

    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(components.getComponent("pet", "TaskMovementHold")).toBeDefined();
    expect(components.getComponent("pet", "AgentChannelState")?.status).toBe("working");
  });

  it("does NOT release on a single tap", () => {
    const components = storeWithTappablePet("waiting");

    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(0));

    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe("waiting");
  });

  it("does NOT release when the two taps land too far apart in time", () => {
    const components = storeWithTappablePet("waiting");

    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(0));
    // 500ms > the 400ms double-click window: this reads as two separate taps.
    runUserInteractionBehaviorSystem(components, tapAt(0, 0), createManualClock(500));

    expect(components.getComponent("pet", "AgentTaskState")?.status).toBe("waiting");
  });
});
