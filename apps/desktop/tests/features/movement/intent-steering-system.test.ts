import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runIntentSteeringSystem } from "@/features/movement/systems";
import type { Force } from "@/features/physics/systems";

function makeFlyer(intent: "idle" | "active" | "seek", targetX: number | null, targetY: number | null) {
  return createComponentStore([{
    id: "pet-a",
    components: [
      { type: "Transform" as const, position: { x: 100, y: 100 } },
      { type: "FlyingTag" },
      { type: "MovementProfile" as const, idleForce: 0.001, activeForce: 0.002, seekForce: 0.003 },
      { type: "IntentState" as const, intent },
      { type: "MotionTarget" as const, targetEntityId: null, targetPosition: targetX !== null ? { x: targetX, y: targetY! } : null },
    ],
  }]);
}

describe("intent steering system", () => {
  it("emits zero force when there is no target", () => {
    const store = makeFlyer("idle", null, null);
    const forceGroups: Force[][] = [];
    runIntentSteeringSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: 0, y: 0 });
  });

  it("emits zero force when at target within arrival radius", () => {
    const store = makeFlyer("idle", 108, 100); // 8px away — inside 16px radius
    const forceGroups: Force[][] = [];
    runIntentSteeringSystem(store, forceGroups);
    expect(forceGroups.flat()).toContainEqual({ id: "pet-a", x: 0, y: 0 });
  });

  it("uses seekForce when intent is seek and target is far", () => {
    const store = makeFlyer("seek", 1100, 100); // far right, dy=0 so all force is on x
    const forceGroups: Force[][] = [];
    runIntentSteeringSystem(store, forceGroups);
    expect(forceGroups.flat()[0]?.x).toBeCloseTo(0.003);
  });

  it("uses idleForce when intent is idle and target is far", () => {
    const store = makeFlyer("idle", 1100, 100);
    const forceGroups: Force[][] = [];
    runIntentSteeringSystem(store, forceGroups);
    expect(forceGroups.flat()[0]?.x).toBeCloseTo(0.001);
  });
});
