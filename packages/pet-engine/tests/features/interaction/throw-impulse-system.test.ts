import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runThrowImpulseSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { describe, expect, it } from "vitest";

/**
 * The one door velocity changes reach the physics bodies through.
 *
 * Two writers use it and they mean different things by "impulse": a throw is a
 * statement about where the pet goes next, so it replaces; a kick is a transfer
 * between two bodies, so it adds. The default is the replacing one, because it
 * is the older meaning and every existing writer relies on it.
 */

function physics(velocities: Record<string, { x: number; y: number }>) {
  const applied: Array<{ id: string; velocity: { x?: number; y?: number } }> = [];
  return {
    applied,
    velocity(id: string) {
      return velocities[id] ?? null;
    },
    setVelocity(id: string, velocity: { x?: number; y?: number }) {
      applied.push({ id, velocity });
    },
  };
}

function entity(id: string) {
  return { id, components: [{ type: "Transform" as const, position: { x: 0, y: 0 } }] };
}

describe("throw impulse system", () => {
  it("replaces the velocity by default, which is what a throw is", () => {
    const store = createComponentStore([entity("pet-a")]);
    store.setComponent("pet-a", { type: "ThrowImpulse", velocity: { x: 12, y: -6 } });
    const world = physics({ "pet-a": { x: 5, y: 5 } });

    runThrowImpulseSystem(store, world);

    expect(world.applied).toEqual([{ id: "pet-a", velocity: { x: 12, y: -6 } }]);
    expect(store.getComponent("pet-a", "ThrowImpulse")).toBeUndefined();
  });

  it("adds to what the body is already doing when asked to", () => {
    const store = createComponentStore([entity("prop-ball")]);
    store.setComponent("prop-ball", {
      type: "ThrowImpulse",
      mode: "add",
      velocity: { x: 4, y: -3 },
    });
    const world = physics({ "prop-ball": { x: 10, y: 1 } });

    runThrowImpulseSystem(store, world);

    // A ball already rolling at 10 comes out of a kick faster, not reset to it.
    expect(world.applied).toEqual([{ id: "prop-ball", velocity: { x: 14, y: -2 } }]);
  });

  it("clamps the sum, because a sum has no other bound", () => {
    const store = createComponentStore([entity("prop-ball")]);
    store.setComponent("prop-ball", {
      type: "ThrowImpulse",
      mode: "add",
      velocity: { x: 26, y: 0 },
    });
    const world = physics({ "prop-ball": { x: 25, y: 0 } });

    runThrowImpulseSystem(store, world);

    // The boundary walls are 48px thick with nothing doing continuous collision
    // behind them, so no single tick may carry a body that far.
    expect(world.applied[0].velocity.x).toBeCloseTo(40, 5);
  });

  it("drops an additive impulse aimed at a body that is gone", () => {
    const store = createComponentStore([entity("prop-ball")]);
    store.setComponent("prop-ball", {
      type: "ThrowImpulse",
      mode: "add",
      velocity: { x: 4, y: 0 },
    });

    runThrowImpulseSystem(store, physics({}));

    expect(store.getComponent("prop-ball", "ThrowImpulse")).toBeUndefined();
  });
});
