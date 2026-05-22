import { describe, expect, it } from "vitest";
import type { EntityDeclaration } from "@/core/ecs/component-store";
import { createComponentStore } from "@/core/ecs/component-store";

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
          { type: "CanWalk", speed: 0.01 },
          { type: "WalkingState" },
        ],
      },
    ]);

    store.removeComponent("pet-a", "WalkingState");

    expect(store.getComponent("pet-a", "WalkingState")).toBeUndefined();
    expect(store.query("CanWalk", "WalkingState")).toEqual([]);
  });
});
