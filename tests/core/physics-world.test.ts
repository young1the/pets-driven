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

  it("can clear horizontal velocity when movement modes need to stabilize", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });

    world.applyForce("pet-a", { x: 0.02, y: 0 });
    world.step(16);
    expect(world.snapshot().bodies.find((body) => body.id === "pet-a")?.vx).toBeGreaterThan(0);

    world.setVelocity("pet-a", { x: 0 });

    expect(world.snapshot().bodies.find((body) => body.id === "pet-a")?.vx).toBe(0);
  });

  it("can lock horizontal position when attaching to a climbable surface", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 180, y: 100 }, { width: 32, height: 38 });

    world.setPosition("pet-a", { x: 120 });

    const pet = world.snapshot().bodies.find((body) => body.id === "pet-a");
    expect(pet?.x).toBe(120);
    expect(pet?.y).toBe(100);
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
    expect(pet?.y).toBeLessThanOrEqual(582);
    expect(ground).toMatchObject({
      isStatic: true,
      shape: "rectangle",
      width: 800,
      height: 40,
    });
  });

  it("lets non-flying rectangle bodies fall visibly under gravity within one second", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });

    for (let index = 0; index < 60; index += 1) {
      world.step(16);
    }

    const pet = world.snapshot().bodies.find((body) => body.id === "pet-a");
    expect(pet?.y).toBeGreaterThan(220);
  });

  it("does not let dynamic pet bodies become physical ground for each other", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addStaticRectangle("ground", { x: 400, y: 620 }, { width: 800, height: 40 });
    world.addRectangle("pet-below", { x: 100, y: 560 }, { width: 32, height: 38 });
    world.addRectangle("pet-above", { x: 100, y: 100 }, { width: 32, height: 38 });

    for (let index = 0; index < 180; index += 1) {
      world.step(16);
    }

    const above = world.snapshot().bodies.find((body) => body.id === "pet-above");
    const below = world.snapshot().bodies.find((body) => body.id === "pet-below");

    expect(above?.y).toBeGreaterThanOrEqual((below?.y ?? 0) - 4);
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
