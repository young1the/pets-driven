import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runKeyboardControlMovementSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it, vi } from "vitest";

function createPhysics() {
  return {
    setVelocity: vi.fn(),
  };
}

describe("KeyboardControlMovementSystem", () => {
  it("does nothing without a control target", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: null },
          { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
        ],
      },
    ]);
    const physics = createPhysics();

    runKeyboardControlMovementSystem(components, physics, createManualClock(0));

    expect(physics.setVelocity).not.toHaveBeenCalled();
  });

  it("sets a constant velocity on the selected CanControl target", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
        ],
      },
      { id: "pet-a", components: [{ type: "CanControl", speed: 1.4 }] },
    ]);
    const physics = createPhysics();
    const clock = createManualClock(0);

    runKeyboardControlMovementSystem(components, physics, clock);

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 1.4 });
    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "user-interaction",
      reason: "keyboard-control",
    });
  });

  it("never drives the vertical axis, whatever the input vector carries", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          // A shape keyboardVector no longer produces, kept here because the
          // guarantee is the system's and not the vector's: steering owns x and
          // nothing else, so a jump in flight, a fall and gravity all survive
          // underneath it. Space is the only way off the floor.
          { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: -1 } },
        ],
      },
      { id: "pet-a", components: [{ type: "CanControl", speed: 1.4 }] },
    ]);
    const physics = createPhysics();

    runKeyboardControlMovementSystem(components, physics, createManualClock(0));

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 1.4 });
  });

  it("stops horizontal drift when the selected target has no directional input", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
        ],
      },
      { id: "pet-a", components: [{ type: "CanControl", speed: 1.4 }] },
    ]);
    const physics = createPhysics();

    runKeyboardControlMovementSystem(components, physics, createManualClock(0));

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0 });
  });

  it("does not set velocity when target lacks CanControl", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
        ],
      },
      { id: "pet-a", components: [] },
    ]);
    const physics = createPhysics();

    runKeyboardControlMovementSystem(components, physics, createManualClock(0));

    expect(physics.setVelocity).not.toHaveBeenCalled();
  });
});

describe("a pet held by the keyboard", () => {
  function heldPet(pressedCodes: string[], vector: { x: number; y: number }) {
    return createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes, vector },
        ],
      },
      {
        id: "pet-a",
        components: [
          { type: "CanControl", speed: 1.4 },
          { type: "Steering", mode: "pursue" },
          { type: "MotionTarget", targetEntityId: null, targetPosition: { x: 500, y: 100 } },
        ],
      },
    ]);
  }

  it("stays claimed between two presses, so nothing else re-plans the body", () => {
    const components = heldPet([], { x: 0, y: 0 });

    runKeyboardControlMovementSystem(components, createPhysics(), createManualClock(1_000));

    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "user-interaction",
      reason: "keyboard-control",
      expiresAt: 1_500,
    });
  });

  it("drops where it was walking, so it waits instead of finishing the trip", () => {
    const components = heldPet([], { x: 0, y: 0 });

    runKeyboardControlMovementSystem(components, createPhysics(), createManualClock(0));

    expect(components.getComponent("pet-a", "MotionTarget")).toMatchObject({
      targetEntityId: null,
      targetPosition: null,
    });
    expect(components.getComponent("pet-a", "Steering")).toMatchObject({ mode: "stand" });
  });

  it("keeps its claim while it is actually being steered", () => {
    const components = heldPet(["KeyD"], { x: 1, y: 0 });
    const physics = createPhysics();

    runKeyboardControlMovementSystem(components, physics, createManualClock(0));

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 1.4 });
    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "user-interaction",
      reason: "keyboard-control",
    });
  });
});

describe("a held pet the user is also touching", () => {
  function heldPetBeing(reason: string, expiresAt: number) {
    return createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
        ],
      },
      {
        id: "pet-a",
        components: [
          { type: "CanControl", speed: 1.4 },
          {
            type: "BehaviorDecisionState",
            source: "user-interaction",
            decidedAt: 0,
            expiresAt,
            reason,
            lastAutonomousReason: null,
            lastAutonomousAt: null,
          },
        ],
      },
    ]);
  }

  it("lets petting have the pet, hold or no hold", () => {
    const components = heldPetBeing("petting", 3_000);

    runKeyboardControlMovementSystem(components, createPhysics(), createManualClock(1_000));

    // Holding a pet must not lock its owner out of it: the hold outranks what
    // the pet and its agent want, never the hands that are on it.
    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      reason: "petting",
    });
  });

  it("takes the hold back on the tick after that gesture lapses", () => {
    const components = heldPetBeing("petting", 3_000);

    runKeyboardControlMovementSystem(components, createPhysics(), createManualClock(3_001));

    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      reason: "keyboard-control",
    });
  });
});
