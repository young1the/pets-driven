import { Bodies, Body, Engine, World, type Body as MatterBody } from "matter-js";
import type { WorldSnapshot } from "../snapshots/world-snapshot";

export type Vector = { x: number; y: number };
type Size = { width: number; height: number };
type BodyShape =
  | { shape: "circle"; radius: number; width: number; height: number }
  | { shape: "rectangle"; width: number; height: number };

export type MatterPhysicsWorld = {
  addCircle(id: string, position: Vector, radius: number): void;
  addRectangle(id: string, position: Vector, size: Size): void;
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
  const shapes = new Map<string, BodyShape>();

  return {
    addCircle(id, position, radius) {
      const body = Bodies.circle(position.x, position.y, radius, {
        frictionAir: 0.08,
        restitution: 0.2,
      });
      bodies.set(id, body);
      shapes.set(id, { shape: "circle", radius, width: radius * 2, height: radius * 2 });
      World.add(engine.world, body);
    },
    addRectangle(id, position, size) {
      const body = Bodies.rectangle(position.x, position.y, size.width, size.height, {
        frictionAir: 0.16,
        restitution: 0,
      });
      Body.setInertia(body, Infinity);
      bodies.set(id, body);
      shapes.set(id, { shape: "rectangle", ...size });
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
        bodies: [...bodies.entries()].map(([id, body]) => {
          const shape = shapes.get(id) ?? {
            shape: "circle",
            radius: body.circleRadius ?? 0,
            width: (body.circleRadius ?? 0) * 2,
            height: (body.circleRadius ?? 0) * 2,
          };

          return {
            id,
            x: body.position.x,
            y: body.position.y,
            vx: body.velocity.x,
            vy: body.velocity.y,
            ...shape,
          };
        }),
        pets: [],
      };
    },
  };
}
