import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

function createStore() {
  return createComponentStore([
    {
      id: "user-interaction",
      components: [
        { type: "KeyboardControlTarget", entityId: null },
        { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
      ],
    },
    {
      id: "pet-a",
      components: [
        { type: "CanDrag" },
        { type: "CanControl", speed: 1.4 },
        // A walker, so the jump key has something to ask JumpSystem for.
        { type: "WalkingTag" },
        { type: "Transform", position: { x: 100, y: 100 } },
        { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      ],
    },
    {
      id: "pet-b",
      components: [
        { type: "Transform", position: { x: 200, y: 100 } },
        { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      ],
    },
  ]);
}

describe("UserInteractionBehaviorSystem", () => {
  it("selects only CanControl entities on pointer down", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 100, y: 100 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId).toBe(
      "pet-a",
    );
  });

  it("selects CanControl entities from a padded hit area", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 128, y: 100 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId).toBe(
      "pet-a",
    );
  });

  it("does not select entities without CanControl", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 200, y: 100 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(
      components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId,
    ).toBeNull();
  });

  it("starts a pending drag only for CanDrag entities", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 7,
      at: 0,
      position: { x: 110, y: 90 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "DragInteraction")).toMatchObject({
      type: "DragInteraction",
      pointerId: 7,
      entityId: "pet-a",
      phase: "pending",
      grabOffset: { x: -10, y: 10 },
    });
  });

  it("throwing a grabbed pet drops it as the keyboard control target", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    // Grab the pet: pointer.down selects it as the keyboard control target.
    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 3,
      at: 0,
      position: { x: 100, y: 100 },
    });
    // Flick it to the right fast enough to clear the throw threshold.
    events.push({
      kind: "pointer",
      type: "pointer.move",
      pointerId: 3,
      at: 8,
      position: { x: 150, y: 100 },
    });
    events.push({
      kind: "pointer",
      type: "pointer.move",
      pointerId: 3,
      at: 16,
      position: { x: 200, y: 100 },
    });
    events.push({
      kind: "pointer",
      type: "pointer.up",
      pointerId: 3,
      at: 16,
      position: { x: 200, y: 100 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    // The throw impulse carries horizontal velocity, and the pet is no longer
    // the keyboard target — so KeyboardControlMovementSystem's idle-stop can't
    // zero that velocity every tick and flatten the arc.
    expect(components.getComponent("pet-a", "ThrowImpulse")?.velocity.x).toBeGreaterThan(0);
    expect(
      components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId,
    ).toBeNull();
  });

  it("caps a very hard flick so the pet cannot tunnel through a wall", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    // A huge pointer jump in a single millisecond yields an enormous raw
    // release velocity; the throw impulse must be clamped to a safe speed.
    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 4,
      at: 0,
      position: { x: 100, y: 100 },
    });
    events.push({
      kind: "pointer",
      type: "pointer.move",
      pointerId: 4,
      at: 1,
      position: { x: 5000, y: 100 },
    });
    events.push({
      kind: "pointer",
      type: "pointer.up",
      pointerId: 4,
      at: 1,
      position: { x: 5000, y: 100 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    const impulse = components.getComponent("pet-a", "ThrowImpulse");
    expect(impulse).toBeDefined();
    const speed = Math.hypot(impulse?.velocity.x ?? 0, impulse?.velocity.y ?? 0);
    // A flick this hard clamps right to the cap (allow float rounding).
    expect(speed).toBeCloseTo(40, 5);
    // Still a rightward throw — clamping preserves direction.
    expect(impulse?.velocity.x).toBeGreaterThan(0);
  });

  it("updates keyboard vector from pressed keys", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "keyboard",
      type: "keyboard.down",
      key: "ArrowRight",
      code: "ArrowRight",
      at: 0,
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "KeyboardInputState")?.vector).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("steers along the floor only, so a vertical key is not a direction", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "keyboard",
      type: "keyboard.down",
      key: "ArrowUp",
      code: "ArrowUp",
      at: 0,
    });
    events.push({ kind: "keyboard", type: "keyboard.down", key: "w", code: "KeyW", at: 1 });
    runUserInteractionBehaviorSystem(components, events, clock);

    // They still land in pressedCodes — the set is every key the surface
    // relayed — but neither of them steers anything.
    expect(components.getComponent("user-interaction", "KeyboardInputState")?.vector).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("releasing a steered pet", () => {
  function selectPetA() {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 100, y: 100 },
    });
    events.push({ kind: "keyboard", type: "keyboard.down", key: "d", code: "KeyD", at: 0 });
    runUserInteractionBehaviorSystem(components, events, clock);

    return { components, events, clock };
  }

  it("hands the pet back when the user presses escape", () => {
    const { components, events, clock } = selectPetA();

    events.push({ kind: "keyboard", type: "keyboard.down", key: "Escape", code: "Escape", at: 1 });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(
      components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId,
    ).toBeNull();
  });

  it("never steers with the release key", () => {
    const { components, events, clock } = selectPetA();

    events.push({ kind: "keyboard", type: "keyboard.down", key: "Escape", code: "Escape", at: 1 });
    runUserInteractionBehaviorSystem(components, events, clock);

    const input = components.getComponent("user-interaction", "KeyboardInputState");
    expect(input?.pressedCodes).not.toContain("Escape");
    // The direction that was held is still held — releasing the pet is the
    // point, not forgetting which way the user was pushing it.
    expect(input?.pressedCodes).toContain("KeyD");
  });

  it("hands the pet back, holding nothing, when focus leaves the surface", () => {
    const { components, events, clock } = selectPetA();

    events.push({ kind: "keyboard", type: "keyboard.blur", at: 1 });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(
      components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId,
    ).toBeNull();
    // Whatever was held can never be released by a surface that stopped
    // hearing keys, so a blur stands for every key-up it will not deliver.
    expect(components.getComponent("user-interaction", "KeyboardInputState")).toMatchObject({
      pressedCodes: [],
      vector: { x: 0, y: 0 },
    });
  });
});

describe("jumping a steered pet", () => {
  function selectPetA() {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({
      kind: "pointer",
      type: "pointer.down",
      pointerId: 1,
      at: 0,
      position: { x: 100, y: 100 },
    });
    runUserInteractionBehaviorSystem(components, events, clock);

    return { components, events, clock };
  }

  function pressJump(
    events: ReturnType<typeof createWorldEventQueue>,
    at: number,
    type: "keyboard.down" | "keyboard.up" = "keyboard.down",
  ) {
    events.push({ kind: "keyboard", type, key: " ", code: "Space", at });
  }

  it("asks JumpSystem for a jump when the user presses space", () => {
    const { components, events, clock } = selectPetA();

    pressJump(events, 1);
    runUserInteractionBehaviorSystem(components, events, clock);

    // Only ever a request: grounded-ness, the impulse and the landing cooldown
    // are JumpSystem's, exactly as they are for an autonomous request-jump.
    expect(components.getComponent("pet-a", "JumpActionState")).toEqual({
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
  });

  it("never steers with the jump key", () => {
    const { components, events, clock } = selectPetA();

    pressJump(events, 1);
    runUserInteractionBehaviorSystem(components, events, clock);

    const input = components.getComponent("user-interaction", "KeyboardInputState");
    expect(input?.pressedCodes).not.toContain("Space");
    expect(input?.vector).toEqual({ x: 0, y: 0 });
  });

  it("leaves a jump already in flight alone, so leaning on space is one jump", () => {
    const { components, events, clock } = selectPetA();

    pressJump(events, 1);
    runUserInteractionBehaviorSystem(components, events, clock);
    const inFlight = components.getComponent("pet-a", "JumpActionState");
    if (inFlight) inFlight.phase = "rising";

    pressJump(events, 2, "keyboard.up");
    pressJump(events, 3);
    runUserInteractionBehaviorSystem(components, events, clock);

    // JumpSystem keeps the component until the landing cooldown lapses, so its
    // presence is what says "not ready" — a second press mid-air is not a
    // second jump, and re-requesting would drop the pet out of its rise.
    expect(components.getComponent("pet-a", "JumpActionState")?.phase).toBe("rising");
  });

  it("does nothing when no pet is held", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    pressJump(events, 0);
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });

  it("does nothing for a pet that is not walking", () => {
    const { components, events, clock } = selectPetA();
    components.removeComponent("pet-a", "WalkingTag");

    pressJump(events, 1);
    runUserInteractionBehaviorSystem(components, events, clock);

    // A flier or a pet on a wall is not standing on anything to push off.
    expect(components.getComponent("pet-a", "JumpActionState")).toBeUndefined();
  });
});
