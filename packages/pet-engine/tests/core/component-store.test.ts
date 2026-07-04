import { describe, expect, it } from "vitest";
import type { EntityDeclaration } from "@pets-driven/pet-engine/core/component-store";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";

describe("component store", () => {
  it("hydrates declarations into entity ids and component tables", () => {
    const declaration: EntityDeclaration = {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: 480, y: 500 } },
      ],
    };

    const store = createComponentStore([declaration]);
    const runtimeEntity = store.getEntity("user-anchor");

    expect(runtimeEntity).toEqual({ id: "user-anchor" });
    expect(runtimeEntity).not.toHaveProperty("components");
    expect(store.components("Transform").get("user-anchor")).toEqual({
      type: "Transform",
      position: { x: 480, y: 500 },
    });
    expect(store.getComponent("user-anchor", "Transform")).toEqual({
      type: "Transform",
      position: { x: 480, y: 500 },
    });
  });

  it("joins component tables when querying entities", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "IntentState", intent: "idle" },
        ],
      },
      {
        id: "user-anchor",
        components: [
          { type: "UserAnchor" },
          { type: "Transform", position: { x: 10, y: 10 } },
        ],
      },
    ]);

    const results = store.query("Transform", "IntentState");

    expect(results).toEqual([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "IntentState", intent: "idle" },
        ],
      },
    ]);
  });

  it("removes components from their type table", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "CanWalk", force: 0.01 },
          { type: "WalkingTag" },
        ],
      },
    ]);

    store.removeComponent("pet-a", "WalkingTag");

    expect(store.getComponent("pet-a", "WalkingTag")).toBeUndefined();
    expect(store.query("CanWalk", "WalkingTag")).toEqual([]);
  });

  it("spawns a new entity with components mid-simulation", () => {
    const store = createComponentStore([]);

    store.spawn("social-1", [
      {
        type: "SocialSession",
        kind: "greet",
        initiatorId: "pet-a",
        responderId: "pet-b",
        phase: "greet",
        startedAt: 0,
        endsAt: 3_000,
        greeted: false,
      },
    ]);

    expect(store.getEntity("social-1")).toEqual({ id: "social-1" });
    expect(store.getComponent("social-1", "SocialSession")).toMatchObject({
      kind: "greet",
      initiatorId: "pet-a",
    });
  });

  it("rejects spawning an id that already exists", () => {
    const store = createComponentStore([
      { id: "pet-a", components: [{ type: "WalkingTag" }] },
    ]);

    expect(() => store.spawn("pet-a", [])).toThrow(/already exists/);
  });

  it("destroys an entity and clears all of its component tables", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "WalkingTag" },
        ],
      },
    ]);

    store.destroy("pet-a");

    expect(store.getEntity("pet-a")).toBeUndefined();
    expect(store.getComponent("pet-a", "Transform")).toBeUndefined();
    expect(store.getComponent("pet-a", "WalkingTag")).toBeUndefined();
    expect(store.query("Transform")).toEqual([]);
  });

  it("no-ops when destroying an unknown entity", () => {
    const store = createComponentStore([]);
    expect(() => store.destroy("nobody")).not.toThrow();
  });

  it("reuses callback tuple storage when iterating matching entities", () => {
    const store = createComponentStore([
      {
        id: "pet-a",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "IntentState", intent: "idle" },
        ],
      },
      {
        id: "pet-b",
        components: [
          { type: "Transform", position: { x: 10, y: 0 } },
          { type: "IntentState", intent: "active" },
        ],
      },
    ]);

    const tuples: unknown[] = [];
    store.forEach(["Transform", "IntentState"], (_id, components) => {
      tuples.push(components);
    });

    expect(tuples).toHaveLength(2);
    expect(tuples[1]).toBe(tuples[0]);
  });
});
