import { createMatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { describe, expect, it } from "vitest";

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

  it("lets dynamic pet bodies pass through each other (ghost bodies)", () => {
    // Pets only collide with surfaces; pet-to-pet "touching" is a geometric
    // signal derived by PetCollisionSyncSystem, not a physical constraint.
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });
    world.addRectangle("pet-b", { x: 112, y: 100 }, { width: 32, height: 38 });

    for (let index = 0; index < 5; index += 1) {
      world.step(16);
    }

    const petA = world.snapshot().bodies.find((body) => body.id === "pet-a");
    const petB = world.snapshot().bodies.find((body) => body.id === "pet-b");

    expect(world.activeCollisions()).toEqual([]);
    // No solver separation: the overlapping bodies fall in place, unmoved in x.
    expect(petA?.x).toBeCloseTo(100, 5);
    expect(petB?.x).toBeCloseTo(112, 5);
  });

  it("removes a body from the world and its snapshot", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addRectangle("pet-a", { x: 100, y: 100 }, { width: 32, height: 38 });
    world.addRectangle("pet-b", { x: 300, y: 100 }, { width: 32, height: 38 });

    world.removeBody("pet-a");

    const ids = world.snapshot().bodies.map((body) => body.id);
    expect(ids).not.toContain("pet-a");
    expect(ids).toContain("pet-b");
    // Removal is idempotent; a stale id no-ops instead of throwing.
    expect(() => world.removeBody("pet-a")).not.toThrow();
    // A removed body no longer participates in the simulation.
    world.setPosition("pet-a", { x: 500 });
    expect(world.snapshot().bodies.find((body) => body.id === "pet-a")).toBeUndefined();
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
