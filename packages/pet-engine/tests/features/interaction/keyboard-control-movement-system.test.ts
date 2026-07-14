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

  it("uses the same speed scale for vertical input", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes: ["ArrowUp"], vector: { x: 0, y: -1 } },
        ],
      },
      { id: "pet-a", components: [{ type: "CanControl", speed: 1.4 }] },
    ]);
    const physics = createPhysics();

    runKeyboardControlMovementSystem(components, physics, createManualClock(0));

    expect(physics.setVelocity).toHaveBeenCalledWith("pet-a", { x: 0, y: -1.4 });
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
