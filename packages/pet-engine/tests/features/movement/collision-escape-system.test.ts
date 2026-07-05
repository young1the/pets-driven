import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runCollisionEscapeSystem } from "@pets-driven/pet-engine/features/movement/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

describe("collision escape system", () => {
  it("adds a horizontal escape force while walking pets remain in Matter contact", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 100, y: 500 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
          { type: "WalkingTag" },
          { type: "CanWalk", force: 0.001 },
          {
            type: "PetCollision",
            otherEntityId: "pet-b",
            otherPosition: { x: 100, y: 462 },
            startedAt: 1000,
            lastSeenAt: 1000,
          },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "Transform", position: { x: 100, y: 462 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
        ],
      },
    ]);
    const forceGroups: Array<Array<{ id: string; x: number; y: number }>> = [];

    runCollisionEscapeSystem(store, forceGroups, createManualClock(1100));

    expect(forceGroups).toEqual([[{ id: "pet-a", x: -0.004, y: 0 }]]);
  });

  it("doubles the escape force when the same collision has stayed active", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 90, y: 500 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
          { type: "WalkingTag" },
          { type: "CanWalk", force: 0.001 },
          {
            type: "PetCollision",
            otherEntityId: "pet-b",
            otherPosition: { x: 110, y: 500 },
            startedAt: 1000,
            lastSeenAt: 1400,
          },
        ],
      },
    ]);
    const forceGroups: Array<Array<{ id: string; x: number; y: number }>> = [];

    runCollisionEscapeSystem(store, forceGroups, createManualClock(1400));

    expect(forceGroups).toEqual([[{ id: "pet-a", x: -0.008, y: 0 }]]);
  });
});

describe("collision escape — session partners (B2)", () => {
  it("separates session partners gently: base force, no 4x shove, no stuck escalation", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 90, y: 500 } },
          { type: "PhysicsBody", shape: "rectangle", width: 32, height: 38 },
          { type: "WalkingTag" },
          { type: "CanWalk", force: 0.001 },
          {
            type: "SocialSessionMember",
            sessionId: "sess",
            partnerId: "pet-b",
            role: "initiator",
          },
          {
            type: "PetCollision",
            otherEntityId: "pet-b",
            otherPosition: { x: 110, y: 500 },
            startedAt: 1000,
            lastSeenAt: 1400,
          },
        ],
      },
    ]);
    const forceGroups: Array<Array<{ id: string; x: number; y: number }>> = [];

    // Same "stuck" timing as the escalation test above — partners still only
    // get the gentle base force.
    runCollisionEscapeSystem(store, forceGroups, createManualClock(1400));

    expect(forceGroups).toEqual([[{ id: "pet-a", x: -0.001, y: 0 }]]);
  });
});
