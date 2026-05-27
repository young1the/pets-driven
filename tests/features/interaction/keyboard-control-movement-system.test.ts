import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runKeyboardControlMovementSystem } from "@/features/interaction/systems";
import type { Force } from "@/features/physics/systems";
import { createManualClock } from "@/shared/time/manual-clock";

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
    const forceGroups: Force[][] = [];

    runKeyboardControlMovementSystem(components, forceGroups, createManualClock(0));

    expect(forceGroups).toEqual([]);
  });

  it("applies force to the selected CanControl target", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          { type: "KeyboardControlTarget", entityId: "pet-a" },
          { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
        ],
      },
      { id: "pet-a", components: [{ type: "CanControl", force: 0.003 }] },
    ]);
    const forceGroups: Force[][] = [];
    const clock = createManualClock(0);

    runKeyboardControlMovementSystem(components, forceGroups, clock);

    expect(forceGroups).toEqual([[{ id: "pet-a", x: 0.003, y: 0 }]]);
    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "user-interaction",
      reason: "keyboard-control",
    });
  });

  it("does not apply force when target lacks CanControl", () => {
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
    const forceGroups: Force[][] = [];

    runKeyboardControlMovementSystem(components, forceGroups, createManualClock(0));

    expect(forceGroups).toEqual([]);
  });
});
