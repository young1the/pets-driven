import { createMatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import { describe, expect, it } from "vitest";

// Regression: a pet thrown into a wall must keep falling under gravity, not
// stick to the wall and creep down. This broke because default pet bodies were
// created with `friction: undefined`, which produced a NaN Coulomb limit in
// matter.js and pinned the pet's vertical velocity against the wall.
describe("thrown pet falls along a wall", () => {
  it("keeps accelerating downward after slamming a wall, like a free fall", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600, gravity: { x: 0, y: 1 } });
    // A right wall and floor, same material the monitor boundaries use.
    world.addStaticRectangle(
      "right-wall",
      { x: 824, y: 300 },
      { width: 48, height: 600 },
      { friction: 0.8, restitution: 0 },
    );
    world.addStaticRectangle(
      "floor",
      { x: 400, y: 624 },
      { width: 800, height: 48 },
      { friction: 0.8, restitution: 0 },
    );

    // Thrown hard into the wall; identical pet free-falling as the baseline.
    world.addRectangle("wallPet", { x: 700, y: 100 }, { width: 32, height: 38 });
    world.setVelocity("wallPet", { x: 30, y: 0 });
    world.addRectangle("freePet", { x: 200, y: 100 }, { width: 32, height: 38 });

    for (let i = 0; i < 20; i++) {
      // Both pets stay airborne through this window; AirborneSlipSystem would
      // mark them airborne so the wall can't grip the thrown one.
      world.setAirborneSlip("wallPet", true);
      world.setAirborneSlip("freePet", true);
      world.step(16);
    }

    const bodies = world.snapshot().bodies;
    const wallPet = bodies.find((b) => b.id === "wallPet");
    const freePet = bodies.find((b) => b.id === "freePet");

    // The pet is stopped against the wall horizontally…
    expect(wallPet?.vx ?? 1).toBeCloseTo(0, 1);
    // …but still falling at close to the free-fall speed, not pinned near zero.
    expect(wallPet?.vy ?? 0).toBeGreaterThan((freePet?.vy ?? 0) * 0.9);
  });
});
