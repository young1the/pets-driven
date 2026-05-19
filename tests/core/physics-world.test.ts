import { describe, expect, it } from "vitest";
import { createMatterPhysicsWorld } from "@/core/physics/matter-physics-world";

describe("matter physics world", () => {
  it("moves a rectangle body after an applied force and returns a snapshot", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });

    world.applyForce("pet-a", { x: 0.02, y: 0 });
    world.step(16);

    const pet = world.snapshot().bodies.find((body) => body.id === "pet-a");
    expect(pet?.x).toBeGreaterThan(100);
    expect(pet).toMatchObject({
      shape: "rectangle",
      width: 32,
      height: 38,
    });
  });

  it("applies gravity and lets a static ground stop falling bodies", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addStaticRectangle("ground", { x: 400, y: 620 }, { width: 800, height: 40 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });

    for (let index = 0; index < 180; index += 1) {
      world.step(16);
    }

    const pet = world.snapshot().bodies.find((body) => body.id === "pet-a");
    const ground = world.snapshot().bodies.find((body) => body.id === "ground");

    expect(pet?.y).toBeGreaterThan(100);
    expect(pet?.y).toBeLessThanOrEqual(600 - 19);
    expect(ground).toMatchObject({
      isStatic: true,
      shape: "rectangle",
      width: 800,
      height: 40,
    });
  });

  it("supports per-body gravity scale for flyable or low-gravity bodies", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });
    world.setGravityScale("pet-a", 0);

    for (let index = 0; index < 30; index += 1) {
      world.step(16);
    }

    const pet = world.snapshot().bodies.find((body) => body.id === "pet-a");
    expect(pet?.y).toBeCloseTo(100, 1);
  });
});
