import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  releaseVelocityFromSamples,
  runDraggedEntityKinematicSystem,
} from "@pets-driven/pet-engine/features/interaction/systems";
import { describe, expect, it } from "vitest";

function createPhysicsSpy() {
  return {
    positions: [] as Array<{ id: string; position: { x?: number; y?: number } }>,
    velocities: [] as Array<{ id: string; velocity: { x?: number; y?: number } }>,
    setPosition(id: string, position: { x?: number; y?: number }) {
      this.positions.push({ id, position });
    },
    setVelocity(id: string, velocity: { x?: number; y?: number }) {
      this.velocities.push({ id, velocity });
    },
  };
}

describe("DraggedEntityKinematicSystem", () => {
  it("directly syncs dragging entity to pointer plus grab offset", () => {
    const components = createComponentStore([
      {
        id: "user-interaction",
        components: [
          {
            type: "DragInteraction",
            pointerId: 1,
            entityId: "pet-a",
            phase: "dragging",
            grabOffset: { x: 5, y: -10 },
            pointerPosition: { x: 120, y: 90 },
            startedAt: 0,
            samples: [],
          },
        ],
      },
      {
        id: "pet-a",
        components: [{ type: "Transform", position: { x: 0, y: 0 } }],
      },
    ]);
    const physics = createPhysicsSpy();

    runDraggedEntityKinematicSystem(components, physics);

    expect(components.getComponent("pet-a", "Transform")?.position).toEqual({
      x: 125,
      y: 80,
    });
    expect(physics.positions).toEqual([{ id: "pet-a", position: { x: 125, y: 80 } }]);
    expect(physics.velocities).toEqual([{ id: "pet-a", velocity: { x: 0, y: 0 } }]);
  });

  it("computes release velocity from recent samples in pixels per 16ms tick", () => {
    expect(
      releaseVelocityFromSamples([
        { at: 0, position: { x: 0, y: 0 } },
        { at: 32, position: { x: 64, y: 32 } },
      ]),
    ).toEqual({ x: 32, y: 16 });
  });
});
