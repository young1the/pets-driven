import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runContactSystem } from "@pets-driven/pet-engine/features/contact/systems";
import { describe, expect, it } from "vitest";

const GROUND_Y = 540;
const GROUND_WIDTH = 960;
const GROUND_HEIGHT = 40;
// Ground top edge = GROUND_Y - GROUND_HEIGHT / 2 = 520

function makePet(posX: number, posY: number) {
  return {
    id: "pet-a",
    components: [
      { type: "Transform" as const, position: { x: posX, y: posY } },
      { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
      {
        type: "ContactState" as const,
        grounded: false,
        climbableSurfaceId: null,
        climbableSurfacePosition: null,
      },
    ],
  };
}

function makeGround() {
  return {
    id: "ground",
    components: [
      { type: "Transform" as const, position: { x: 480, y: GROUND_Y } },
      {
        type: "PhysicsBody" as const,
        shape: "rectangle" as const,
        width: GROUND_WIDTH,
        height: GROUND_HEIGHT,
      },
      { type: "Ground" as const },
    ],
  };
}

describe("contact system", () => {
  it("marks entity as grounded when standing on the ground surface", () => {
    // Entity bottom = posY + 19. Ground top = 520.
    // Condition: |entityBottom - groundTop| <= 4  ->  posY + 19 ~= 520  ->  posY = 503
    const store = createComponentStore([makeGround(), makePet(480, 503)]);
    runContactSystem(store);
    expect(store.getComponent("pet-a", "ContactState")?.grounded).toBe(true);
  });

  it("does not mark entity as grounded when well above the surface", () => {
    const store = createComponentStore([makeGround(), makePet(480, 300)]);
    runContactSystem(store);
    expect(store.getComponent("pet-a", "ContactState")?.grounded).toBe(false);
  });

  it("detects a climbable surface within horizontal radius", () => {
    const store = createComponentStore([
      {
        id: "wall-1",
        components: [
          { type: "Transform" as const, position: { x: 150, y: 300 } },
          { type: "ClimbableSurface" as const },
        ],
      },
      makePet(130, 300), // 20px from wall, inside 56px radius
    ]);
    runContactSystem(store);
    expect(store.getComponent("pet-a", "ContactState")?.climbableSurfaceId).toBe("wall-1");
  });

  it("does not detect a climbable surface that is too far away", () => {
    const store = createComponentStore([
      {
        id: "wall-far",
        components: [
          { type: "Transform" as const, position: { x: 400, y: 300 } },
          { type: "ClimbableSurface" as const },
        ],
      },
      makePet(100, 300), // 300px away, outside 56px radius
    ]);
    runContactSystem(store);
    expect(store.getComponent("pet-a", "ContactState")?.climbableSurfaceId).toBeNull();
  });
});
