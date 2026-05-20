import { describe, expect, it } from "vitest";
import { runArrivalBehaviorSystem } from "@/core/systems/arrival-behavior-system";

describe("arrival behavior system", () => {
  it("clears position target when pet arrives within arrival radius", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 108, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 100, y: 100 },
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).toBeNull();
  });

  it("clears position target when x is within arrival radius even if y differs", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 108, y: 500 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 100, y: 100 },
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).toBeNull();
  });

  it("does not clear position target when outside arrival radius", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 200, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 100, y: 100 },
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).not.toBeNull();
  });

  it("switches seeking pet to idle after arriving at user anchor", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "seek" as const },
      transform: { type: "Transform" as const, position: { x: 108, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: "user-anchor",
        targetPosition: { x: 100, y: 100 } as { x: number; y: number } | null,
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };
    const userAnchors = [{ id: "user-anchor", position: { x: 100, y: 100 } }];

    runArrivalBehaviorSystem([entity], userAnchors);

    expect(entity.intent.intent).toBe("idle");
    expect(entity.motion.targetEntityId).toBeNull();
    expect(entity.motion.targetPosition).toBeNull();
  });

  it("does not switch to idle when seeking pet is far from user anchor", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "seek" as const },
      transform: { type: "Transform" as const, position: { x: 200, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: "user-anchor",
        targetPosition: null,
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };
    const userAnchors = [{ id: "user-anchor", position: { x: 100, y: 100 } }];

    runArrivalBehaviorSystem([entity], userAnchors);

    expect(entity.intent.intent).toBe("seek");
    expect(entity.motion.targetEntityId).toBe("user-anchor");
  });

  it("does not affect non-seek pets at the user anchor", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "active" as const },
      transform: { type: "Transform" as const, position: { x: 108, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: "user-anchor",
        targetPosition: null,
      },
      wandersOnArrival: {
        type: "WandersOnArrival" as const,
        arrivalRadius: 16,
      },
    };
    const userAnchors = [{ id: "user-anchor", position: { x: 100, y: 100 } }];

    runArrivalBehaviorSystem([entity], userAnchors);

    expect(entity.intent.intent).toBe("active");
    expect(entity.motion.targetEntityId).toBe("user-anchor");
  });
});
