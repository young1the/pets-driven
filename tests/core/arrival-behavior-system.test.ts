import { describe, expect, it } from "vitest";
import { runArrivalBehaviorSystem } from "@/core/systems/arrival-behavior-system";

describe("arrival behavior system", () => {
  it("clears position target when walk pet arrives within x radius", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 108, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 100, y: 100 },
      },
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).toBeNull();
  });

  it("keeps approach target while a pet is trying to attach to a climb surface", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 124, y: 500 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 120, y: 500 },
      },
      climbIntent: {
        type: "ClimbIntentState" as const,
        phase: "approaching" as const,
        surfaceEntityId: "alice-climb-wall",
        targetY: 120,
      },
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).toEqual({ x: 120, y: 500 });
  });

  it("clears position target when x is within radius even if y differs", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 108, y: 500 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 100, y: 100 },
      },
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).toBeNull();
  });

  it("does not clear position target when outside x radius", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      transform: { type: "Transform" as const, position: { x: 200, y: 100 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 100, y: 100 },
      },
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).not.toBeNull();
  });

  it("clears position target when climb pet arrives within y radius", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      climbing: { type: "ClimbingState" as const },
      transform: { type: "Transform" as const, position: { x: 280, y: 108 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 700, y: 100 },
      },
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
    };

    runArrivalBehaviorSystem([entity], []);

    expect(entity.motion.targetPosition).toBeNull();
  });

  it("does not clear position target when climb pet is outside y radius", () => {
    const entity = {
      intent: { type: "IntentState" as const, intent: "idle" as const },
      climbing: { type: "ClimbingState" as const },
      transform: { type: "Transform" as const, position: { x: 280, y: 300 } },
      motion: {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: { x: 700, y: 100 },
      },
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
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
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
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
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
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
      wandersOnArrival: { type: "WandersOnArrival" as const, arrivalRadius: 16 },
    };
    const userAnchors = [{ id: "user-anchor", position: { x: 100, y: 100 } }];

    runArrivalBehaviorSystem([entity], userAnchors);

    expect(entity.intent.intent).toBe("active");
    expect(entity.motion.targetEntityId).toBe("user-anchor");
  });
});
