import { describe, expect, it } from "vitest";
import type { EntityDeclaration } from "@/core/ecs/component-store";
import { createComponentStore } from "@/core/ecs/component-store";
import { addComponent, createRuntimeEntity } from "@/core/ecs/entity";

describe("component store", () => {
  it("hydrates entity declarations into runtime entities", () => {
    const declaration: EntityDeclaration = {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: 480, y: 500 } },
      ],
    };

    const store = createComponentStore([declaration]);
    const runtimeEntity = store.getEntity("user-anchor");

    expect(runtimeEntity?.components).toBeInstanceOf(Map);
    expect(store.getComponent("user-anchor", "Transform")).toEqual({
      type: "Transform",
      position: { x: 480, y: 500 },
    });
  });

  it("stores runtime entity components in a map", () => {
    const runtimeEntity = createRuntimeEntity("pet-a");

    addComponent(runtimeEntity, { type: "UserAnchor" });

    expect(runtimeEntity.components).toBeInstanceOf(Map);
    expect(runtimeEntity.components.get("UserAnchor")).toEqual({ type: "UserAnchor" });
  });
});
