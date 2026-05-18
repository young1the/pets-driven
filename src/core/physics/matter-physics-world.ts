import { Bodies, Body, Engine, World, type Body as MatterBody } from "matter-js";
import type { WorldSnapshot } from "../snapshots/world-snapshot";

type Vector = { x: number; y: number };

export type MatterPhysicsWorld = {
  addCircle(id: string, position: Vector, radius: number): void;
  applyForce(id: string, force: Vector): void;
  step(deltaMs: number): void;
  snapshot(): WorldSnapshot;
};

export function createMatterPhysicsWorld(bounds: {
  width: number;
  height: number;
}): MatterPhysicsWorld {
  const engine = Engine.create({ gravity: { x: 0, y: 0 } });
  const bodies = new Map<string, MatterBody>();

  return {
    addCircle(id, position, radius) {
      const body = Bodies.circle(position.x, position.y, radius, {
        frictionAir: 0.08,
        restitution: 0.2,
      });
      bodies.set(id, body);
      World.add(engine.world, body);
    },
    applyForce(id, force) {
      const body = bodies.get(id);
      if (body) {
        Body.applyForce(body, body.position, force);
      }
    },
    step(deltaMs) {
      Engine.update(engine, deltaMs);
    },
    snapshot() {
      return {
        width: bounds.width,
        height: bounds.height,
        bodies: [...bodies.entries()].map(([id, body]) => ({
          id,
          x: body.position.x,
          y: body.position.y,
          vx: body.velocity.x,
          vy: body.velocity.y,
          radius: body.circleRadius ?? 0,
        })),
      };
    },
  };
}
