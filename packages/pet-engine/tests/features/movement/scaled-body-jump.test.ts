import { describe, expect, it } from "vitest";
import { createAdoptedPetsScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";

// The desktop app scales an adopted pet's physics body up to roughly the
// rendered sprite size (~156×156), far larger than the engine-default 32×38
// body the walk-force / jump-impulse constants are tuned for. Matter.js gives a
// rectangle a mass proportional to its area, so without compensation a scaled
// pet is ~20× too heavy to move or lift: it never reaches a wander target,
// never returns to "idle", and BehaviorDecisionSystem never offers a jump — the
// pet visibly stops jumping on the desktop. This locks in the fix.
function simulate(bodySize?: { width: number; height: number }) {
  const { clock, world } = createAdoptedPetsScenario(
    [
      {
        id: "pet-a",
        name: "Jumper",
        sourceId: "agent-a",
        personality: {
          type: "Personality",
          openness: 0.6,
          conscientiousness: 0.5,
          extraversion: 0.6,
          agreeableness: 0.5,
          neuroticism: 0.3,
        },
      },
    ],
    {
      monitors: [{ id: "m1", x: 0, y: 0, width: 1920, height: 1040 }],
      petBodySizeByPetId: bodySize ? { "pet-a": bodySize } : undefined,
    },
  );

  let airborneTicks = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let step = 0; step < (60 * 1000) / 16; step += 1) {
    clock.advanceBy(16);
    world.step(16);

    const contact = world.getComponent("pet-a", "ContactState");
    if (contact && !contact.grounded) airborneTicks += 1;

    const transform = world.getComponent("pet-a", "Transform");
    if (transform) {
      minY = Math.min(minY, transform.position.y);
      maxY = Math.max(maxY, transform.position.y);
    }
  }

  return { airborneTicks, jumpRise: maxY === -Infinity ? 0 : maxY - minY };
}

describe("scaled adopted-pet jumping", () => {
  it("the default-sized body jumps", () => {
    const { airborneTicks, jumpRise } = simulate();
    expect(airborneTicks).toBeGreaterThan(0);
    expect(jumpRise).toBeGreaterThan(20);
  });

  it("the desktop app's scaled 156×156 body still jumps", () => {
    const { airborneTicks, jumpRise } = simulate({ width: 156, height: 156 });
    // Before the mass-aware force/impulse scaling this was 0 on both counts.
    expect(airborneTicks).toBeGreaterThan(0);
    expect(jumpRise).toBeGreaterThan(20);
  });
});
