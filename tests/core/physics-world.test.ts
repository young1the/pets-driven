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
});
