import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPettingDetectionSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * 5 samples oscillating x: 190 -> 210 -> 190 -> 210 -> 190 over 400ms.
 * dx signs: +,-,+,- → 3 direction reversals; displacement = 210-190 = 20px.
 * Satisfies PETTING_MIN_REVERSALS(3) and stays under PETTING_MAX_DISPLACEMENT_PX(60).
 */
const OSCILLATING_SAMPLES = [
  { at: 0, position: { x: 190, y: 200 } },
  { at: 100, position: { x: 210, y: 200 } },
  { at: 200, position: { x: 190, y: 200 } },
  { at: 300, position: { x: 210, y: 200 } },
  { at: 400, position: { x: 190, y: 200 } },
];

function makeStore(options?: {
  drag?: { entityId: string };
  samples?: typeof OSCILLATING_SAMPLES;
  cursorPosition?: { x: number; y: number };
  petPosition?: { x: number; y: number };
  bodySize?: { width: number; height: number };
}) {
  const samples = options?.samples ?? OSCILLATING_SAMPLES;
  const cursorPosition = options?.cursorPosition ?? { x: 190, y: 200 };
  const petPosition = options?.petPosition ?? { x: 200, y: 200 };
  const bodySize = options?.bodySize ?? { width: 40, height: 40 };

  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: cursorPosition },
        { type: "CursorState", position: cursorPosition, samples },
      ],
    },
    {
      id: "user-interaction",
      components: options?.drag
        ? [
            {
              type: "DragInteraction" as const,
              pointerId: 1,
              entityId: options.drag.entityId,
              phase: "dragging" as const,
              grabOffset: { x: 0, y: 0 },
              pointerPosition: cursorPosition,
              startedAt: 0,
              samples: [],
            },
          ]
        : [],
    },
    {
      id: "pet-a",
      components: [
        { type: "Transform", position: petPosition },
        { type: "PhysicsBody", shape: "rectangle" as const, ...bodySize },
        { type: "PetIdentity", name: "A" },
      ],
    },
  ]);
}

describe("PettingDetectionSystem", () => {
  it("claims user-interaction and shows a love reaction when the cursor oscillates over the pet's body", () => {
    const store = makeStore();

    runPettingDetectionSystem(store, createManualClock(400));

    const decision = store.getComponent("pet-a", "BehaviorDecisionState");
    expect(decision?.source).toBe("user-interaction");
    expect(decision?.reason).toBe("petting");

    const expression = store.getComponent("pet-a", "PetExpressionState");
    expect(expression?.source).toBe("petting");
    expect(expression?.mood).toBe("love");
    expect(expression?.emote).toBe("heart");
  });

  it("does not trigger petting when the cursor is outside the pet's body bounds", () => {
    const store = makeStore({
      cursorPosition: { x: 500, y: 200 },
      samples: OSCILLATING_SAMPLES.map((s) => ({
        at: s.at,
        position: { x: s.position.x + 310, y: s.position.y },
      })),
    });

    runPettingDetectionSystem(store, createManualClock(400));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
    expect(store.getComponent("pet-a", "PetExpressionState")).toBeUndefined();
  });

  it("does not trigger petting when the cursor is within bounds but not oscillating (a swipe-through)", () => {
    // Monotonic left-to-right sweep through the pet's body — no direction
    // reversals — must not be treated as petting.
    const store = makeStore({
      samples: [
        { at: 0, position: { x: 180, y: 200 } },
        { at: 100, position: { x: 190, y: 200 } },
        { at: 200, position: { x: 200, y: 200 } },
        { at: 300, position: { x: 210, y: 200 } },
        { at: 400, position: { x: 220, y: 200 } },
      ],
      cursorPosition: { x: 220, y: 200 },
    });

    runPettingDetectionSystem(store, createManualClock(400));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
  });

  it("does NOT trigger petting while the pet is being dragged", () => {
    const store = makeStore({ drag: { entityId: "pet-a" } });

    runPettingDetectionSystem(store, createManualClock(400));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")).toBeUndefined();
    expect(store.getComponent("pet-a", "PetExpressionState")).toBeUndefined();
  });

  it("still triggers petting for a different pet while another pet is being dragged", () => {
    const store = makeStore({ drag: { entityId: "some-other-pet" } });

    runPettingDetectionSystem(store, createManualClock(400));

    expect(store.getComponent("pet-a", "BehaviorDecisionState")?.reason).toBe("petting");
  });

  it("extends the reaction duration on continued petting instead of restarting the expression", () => {
    const store = makeStore();

    runPettingDetectionSystem(store, createManualClock(400));
    // Capture primitives, not the live component object — components are
    // mutated in place, so holding a reference would reflect later writes.
    const firstStartedAt = store.getComponent("pet-a", "PetExpressionState")?.startedAt;
    const firstDecisionExpiresAt = store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt;
    const firstExpressionExpiresAt = store.getComponent("pet-a", "PetExpressionState")?.expiresAt;
    expect(firstStartedAt).toBe(400);

    // Continue oscillating a bit later, well before the claim expires.
    runPettingDetectionSystem(store, createManualClock(500));

    const secondExpression = store.getComponent("pet-a", "PetExpressionState");
    const secondDecision = store.getComponent("pet-a", "BehaviorDecisionState");
    // startedAt is untouched — the love expression doesn't restart every frame.
    expect(secondExpression?.startedAt).toBe(400);
    // But the claim/expression window is extended forward.
    expect(secondDecision?.expiresAt).toBeGreaterThan(firstDecisionExpiresAt ?? 0);
    expect(secondExpression?.expiresAt).toBeGreaterThan(firstExpressionExpiresAt ?? 0);
  });
});
