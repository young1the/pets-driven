import { Bodies, Body, Engine, World, type Body as MatterBody } from "matter-js";
import type { WorldSnapshot } from "@/core/world-snapshot";

export type Vector = { x: number; y: number };
type Size = { width: number; height: number };
type PhysicsMaterial = { friction?: number; frictionAir?: number; restitution?: number };
type BodyShape =
  | { shape: "circle"; radius: number; width: number; height: number; isStatic?: boolean }
  | { shape: "rectangle"; width: number; height: number; isStatic?: boolean };

const COLLISION_CATEGORY_SURFACE = 0x0001;
const COLLISION_CATEGORY_DYNAMIC_BODY = 0x0002;

export type MatterPhysicsWorld = {
  addCircle(id: string, position: Vector, radius: number): void;
  addRectangle(id: string, position: Vector, size: Size, material?: PhysicsMaterial): void;
  addStaticRectangle(id: string, position: Vector, size: Size, material?: PhysicsMaterial): void;
  applyForce(id: string, force: Vector): void;
  setGravityScale(id: string, scale: number): void;
  setPosition(id: string, position: Partial<Vector>): void;
  setVelocity(id: string, velocity: Partial<Vector>): void;
  step(deltaMs: number): void;
  snapshot(): WorldSnapshot;
};

export function createMatterPhysicsWorld(bounds: {
  width: number;
  height: number;
  gravity?: Vector;
}): MatterPhysicsWorld {
  const engine = Engine.create();
  engine.gravity.x = bounds.gravity?.x ?? 0;
  engine.gravity.y = bounds.gravity?.y ?? 1;
  const bodies = new Map<string, MatterBody>();
  const shapes = new Map<string, BodyShape>();
  const gravityScales = new Map<string, number>();

  function addBody(id: string, body: MatterBody, shape: BodyShape) {
    bodies.set(id, body);
    shapes.set(id, shape);
    World.add(engine.world, body);
  }

  return {
    addCircle(id, position, radius) {
      const body = Bodies.circle(position.x, position.y, radius, {
        collisionFilter: {
          category: COLLISION_CATEGORY_DYNAMIC_BODY,
          mask: COLLISION_CATEGORY_SURFACE,
        },
        frictionAir: 0.08,
        restitution: 0.2,
      });
      addBody(id, body, { shape: "circle", radius, width: radius * 2, height: radius * 2 });
    },
    addRectangle(id, position, size, material) {
      const body = Bodies.rectangle(position.x, position.y, size.width, size.height, {
        collisionFilter: {
          category: COLLISION_CATEGORY_DYNAMIC_BODY,
          mask: COLLISION_CATEGORY_SURFACE,
        },
        friction: material?.friction,
        frictionAir: material?.frictionAir ?? 0.04,
        restitution: material?.restitution ?? 0,
      });
      Body.setInertia(body, Infinity);
      addBody(id, body, { shape: "rectangle", ...size });
    },
    addStaticRectangle(id, position, size, material) {
      const body = Bodies.rectangle(position.x, position.y, size.width, size.height, {
        isStatic: true,
        collisionFilter: {
          category: COLLISION_CATEGORY_SURFACE,
          mask: COLLISION_CATEGORY_DYNAMIC_BODY,
        },
        friction: material?.friction,
        restitution: material?.restitution ?? 0,
      });
      addBody(id, body, { shape: "rectangle", isStatic: true, ...size });
    },
    applyForce(id, force) {
      const body = bodies.get(id);
      if (body) {
        Body.applyForce(body, body.position, force);
      }
    },
    setGravityScale(id, scale) {
      gravityScales.set(id, scale);
    },
    setPosition(id, position) {
      const body = bodies.get(id);
      if (body) {
        Body.setPosition(body, {
          x: position.x ?? body.position.x,
          y: position.y ?? body.position.y,
        });
      }
    },
    setVelocity(id, velocity) {
      const body = bodies.get(id);
      if (body) {
        Body.setVelocity(body, {
          x: velocity.x ?? body.velocity.x,
          y: velocity.y ?? body.velocity.y,
        });
      }
    },
    step(deltaMs) {
      for (const [id, scale] of gravityScales) {
        const body = bodies.get(id);
        if (!body || body.isStatic || scale === 1) {
          continue;
        }

        Body.applyForce(body, body.position, {
          x: body.mass * engine.gravity.x * engine.gravity.scale * (scale - 1),
          y: body.mass * engine.gravity.y * engine.gravity.scale * (scale - 1),
        });
      }

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
            isStatic: body.isStatic || shape.isStatic,
          };
        }),
        pets: [],
        climbableSurfaces: [],
      };
    },
  };
}
