import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPerceptionSystem } from "@pets-driven/pet-engine/features/perception/systems";
import { describe, expect, it } from "vitest";

describe("PerceptionSystem", () => {
  it("aggregates user anchor, nearby pets, and climbable surfaces per pet", () => {
    const store = createComponentStore([
      {
        id: "user-anchor",
        components: [{ type: "UserAnchor" }, { type: "Transform", position: { x: 480, y: 500 } }],
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
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
    expect(perceptionA?.self.mode).toBe("stand");
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
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

  it("ignores pets and surfaces beyond their perception range", () => {
    const store = createComponentStore([
      {
        id: "wall-far",
        // Climbables carry further than pets and are judged on x alone, so a
        // wall has to be much further out than a pet to fall out of range.
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 1_400, y: 200 } },
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
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

  it("notices a column towering over a pet walking along the floor", () => {
    // The regression that made the claws trinket useless on a real desktop: a
    // climbable's marker sits at the middle of the height it spans, so on a
    // 1080p monitor it is ~460px above a pet on the floor. Judged in a straight
    // line that is out of range at every x — the pet could stand against the
    // wall and perceive nothing — so the column is judged on x alone, the same
    // way ContactSystem judges it.
    const store = createComponentStore([
      {
        id: "wall-tall",
        components: [
          { type: "ClimbableSurface" },
          { type: "Transform", position: { x: 120, y: 540 } },
        ],
      },
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 120, y: 1_002 } },
          {
            type: "Perception",
            nearbyPets: [],
            userAnchor: null,
            nearbyClimbables: [],
            self: { grounded: true, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
          {
            type: "ContactState",
            grounded: true,
            climbableSurfaceId: null,
            climbableSurfacePosition: null,
          },
          { type: "PetIdentity", name: "A" },
        ],
      },
    ]);

    runPerceptionSystem(store);

    expect(store.getComponent("pet-a", "Perception")?.nearbyClimbables).toHaveLength(1);
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "stand" as const },
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
            self: { grounded: false, climbing: false, mode: "stand" as const },
          },
          { type: "Steering", mode: "pursue" as const },
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
    expect(perception?.self.mode).toBe("pursue");
  });

  describe("cursor field", () => {
    function makeCursorStore(
      samples: Array<{ at: number; position: { x: number; y: number } }>,
      cursorPosition: { x: number; y: number } | null,
      petPosition = { x: 200, y: 200 },
    ) {
      return createComponentStore([
        {
          id: "user-anchor",
          components: [
            { type: "UserAnchor" },
            { type: "Transform", position: petPosition },
            { type: "CursorState", position: cursorPosition, samples },
          ],
        },
        {
          id: "pet-a",
          components: [
            { type: "Transform", position: petPosition },
            {
              type: "Perception",
              nearbyPets: [],
              userAnchor: null,
              nearbyClimbables: [],
              self: { grounded: false, climbing: false, mode: "stand" as const },
            },
            { type: "Steering", mode: "stand" as const },
            {
              type: "ContactState",
              grounded: true,
              climbableSurfaceId: null,
              climbableSurfacePosition: null,
            },
            { type: "PetIdentity", name: "A" },
          ],
        },
      ]);
    }

    it("is null when no CursorState entity exists", () => {
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
              self: { grounded: false, climbing: false, mode: "stand" as const },
            },
            { type: "Steering", mode: "stand" as const },
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

      runPerceptionSystem(store, 0);

      expect(store.getComponent("pet-a", "Perception")?.cursor).toBeNull();
    });

    it("is null while CursorState.position is null (no cursor fed yet)", () => {
      const store = makeCursorStore([], null);

      runPerceptionSystem(store, 0);

      expect(store.getComponent("pet-a", "Perception")?.cursor).toBeNull();
    });

    it("derives distance and low speed for a barely-moving cursor", () => {
      // Two samples 16ms apart, 1px of horizontal drift → far below the
      // playful threshold.
      const store = makeCursorStore(
        [
          { at: 0, position: { x: 300, y: 200 } },
          { at: 16, position: { x: 301, y: 200 } },
        ],
        { x: 301, y: 200 },
      );

      runPerceptionSystem(store, 16);

      const cursor = store.getComponent("pet-a", "Perception")?.cursor;
      expect(cursor).not.toBeNull();
      expect(cursor?.distance).toBeCloseTo(101, 0);
      expect(cursor?.speed).toBeLessThan(600);
      expect(cursor?.isPlayful).toBe(false);
    });

    it("flags isPlayful when the cursor darts fast and close to the pet", () => {
      // 200px in 40ms ≈ 5000 px/s — well above the 600 px/s threshold — and
      // the cursor ends up 100px from the pet, inside the 300px radius.
      const store = makeCursorStore(
        [
          { at: 0, position: { x: 100, y: 200 } },
          { at: 40, position: { x: 300, y: 200 } },
        ],
        { x: 300, y: 200 },
      );

      runPerceptionSystem(store, 40);

      const cursor = store.getComponent("pet-a", "Perception")?.cursor;
      expect(cursor?.speed).toBeGreaterThan(600);
      expect(cursor?.distance).toBeCloseTo(100, 0);
      expect(cursor?.isPlayful).toBe(true);
    });

    it("is not playful when the cursor is fast but far from the pet", () => {
      const store = makeCursorStore(
        [
          { at: 0, position: { x: 1000, y: 200 } },
          { at: 40, position: { x: 1200, y: 200 } },
        ],
        { x: 1200, y: 200 },
        { x: 200, y: 200 },
      );

      runPerceptionSystem(store, 40);

      const cursor = store.getComponent("pet-a", "Perception")?.cursor;
      expect(cursor?.speed).toBeGreaterThan(600);
      expect(cursor?.isPlayful).toBe(false);
    });

    it("treats a stale cursor (no recent sample) as stationary", () => {
      // Fast burst happened long ago; "now" is 1000ms later — well past the
      // staleness window — so speed should decay to 0 rather than replay the
      // old burst.
      const store = makeCursorStore(
        [
          { at: 0, position: { x: 100, y: 200 } },
          { at: 40, position: { x: 300, y: 200 } },
        ],
        { x: 300, y: 200 },
      );

      runPerceptionSystem(store, 1040);

      const cursor = store.getComponent("pet-a", "Perception")?.cursor;
      expect(cursor?.speed).toBe(0);
      expect(cursor?.isPlayful).toBe(false);
    });
  });
});
