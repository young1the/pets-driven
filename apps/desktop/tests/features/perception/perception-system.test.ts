import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runPerceptionSystem } from "@/features/perception/systems";

describe("PerceptionSystem", () => {
  it("aggregates user anchor, nearby pets, and climbable surfaces per pet", () => {
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 480, y: 500 } },
        ],
      },
      {
        id: "wall",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 280, y: 200 } },
        ],
      },
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "idle" as const },
          {
            type: "ContactState",
            grounded: true,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "A" },
          { type: "AgentBinding", sourceId: "agent-a" },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "Transform", position: { x: 220, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "idle" as const },
          {
            type: "ContactState",
            grounded: true,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "B" },
          { type: "AgentBinding", sourceId: "agent-b" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    const perceptionA = store.getComponent("pet-a", "Perception");
    expect(perceptionA?.userAnchor?.id).toBe("user-anchor");
    expect(perceptionA?.userAnchor?.distance).toBeCloseTo(Math.hypot(280, 300), 0);
    expect(perceptionA?.nearbyPets).toHaveLength(1);
    expect(perceptionA?.nearbyPets[0].id).toBe("pet-b");
    expect(perceptionA?.nearbyPets[0].distance).toBeCloseTo(20, 0);
    expect(perceptionA?.nearbyClimbables).toHaveLength(1);
    expect(perceptionA?.self.grounded).toBe(true);
    expect(perceptionA?.self.intent).toBe("idle");
  });

  it("sorts nearbyPets and nearbyClimbables by ascending distance", () => {
    const store = createComponentStore([
      {
        id: "wall-a",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 100, y: 200 } },
        ],
      },
      {
        id: "wall-b",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 250, y: 200 } },
        ],
      },
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "idle" as const },
          {
            type: "ContactState",
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "A" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    const perception = store.getComponent("pet-a", "Perception");
    // wall-b is 50px away (nearest), wall-a is 100px away
    expect(perception?.nearbyClimbables[0].id).toBe("wall-b");
    expect(perception?.nearbyClimbables[1].id).toBe("wall-a");
  });

  it("ignores pets and surfaces beyond MAX_PERCEPTION_RANGE", () => {
    const store = createComponentStore([
      {
        id: "wall-far",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 800, y: 200 } },
        ],
      },
      {
        id: "pet-far",
        components: [
          { type: "PetIdentity", name: "Far" },
          { type: "Transform", position: { x: 800, y: 200 } },
        ],
      },
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "idle" as const },
          {
            type: "ContactState",
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "A" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    const perception = store.getComponent("pet-a", "Perception");
    expect(perception?.nearbyClimbables).toHaveLength(0);
    expect(perception?.nearbyPets).toHaveLength(0);
  });

  it("treats userAnchor as null if no UserAnchor entity exists", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "idle" as const },
          {
            type: "ContactState",
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "A" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    expect(store.getComponent("pet-a", "Perception")?.userAnchor).toBeNull();
  });

  it("excludes self from nearbyPets", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "idle" as const },
          {
            type: "ContactState",
            grounded: false,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "A" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    const perception = store.getComponent("pet-a", "Perception");
    expect(perception?.nearbyPets).toHaveLength(0);
  });

  it("reflects climbing state from ClimbingTag marker component", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 200, y: 200 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: false, climbing: false, intent: "idle" as const },
          },
          { type: "IntentState", intent: "active" as const },
          {
            type: "ContactState",
            grounded: false,
            climbableSurfaceId: "wall-1",
            climbableSurfacePosition: { x: 200, y: 200 },
          },
          { type: "ClimbingTag" },
          { type: "PetIdentity", name: "A" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    const perception = store.getComponent("pet-a", "Perception");
    expect(perception?.self.climbing).toBe(true);
    expect(perception?.self.intent).toBe("active");
  });
});
