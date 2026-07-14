import { describe, expect, it } from "vitest";
import {
  createAdoptedPetsScenario,
  deriveAdoptedPetLocomotion,
} from "@pets-driven/pet-engine/core/scenario-fixtures";

// When the desktop host resizes an adopted pet on the fly it calls
// world.setBodySize (+ re-derives the mass-tuned walk/jump forces) so the
// physics body tracks the enlarged sprite. Before that, only the projection
// scale changed while the body stayed small: the taller sprite's feet sank
// below the floor (its y drifted down) until the world was rebuilt by sending
// the pet home and redeploying it. These lock the in-place resize in.
function buildScenario(bodySize: { width: number; height: number }) {
  return createAdoptedPetsScenario(
    [
      {
        id: "pet-a",
        name: "Grower",
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
      petBodySizeByPetId: { "pet-a": bodySize },
    },
  );
}

function settle(
  world: ReturnType<typeof buildScenario>["world"],
  clock: ReturnType<typeof buildScenario>["clock"],
) {
  for (let step = 0; step < 120; step += 1) {
    clock.advanceBy(16);
    world.step(16);
  }
}

function bodyBottom(world: ReturnType<typeof buildScenario>["world"]) {
  const body = world.snapshot().bodies.find((candidate) => candidate.id === "pet-a");
  if (!body) throw new Error("pet-a body missing");
  return body.y + body.height / 2;
}

describe("resizing an adopted pet body in place", () => {
  it("keeps the grown body's feet on the same floor line", () => {
    const { clock, world } = buildScenario({ width: 78, height: 78 });
    settle(world, clock);
    const floorBefore = bodyBottom(world);

    world.setBodySize("pet-a", { width: 156, height: 156 });

    const body = world.getComponent("pet-a", "PhysicsBody");
    expect(body).toMatchObject({ shape: "rectangle", width: 156, height: 156 });

    // The bottom edge is preserved immediately, before any further stepping, so
    // the pet neither pops up nor sinks when it grows.
    expect(bodyBottom(world)).toBeCloseTo(floorBefore, 3);

    settle(world, clock);
    // It stays resting on that floor line rather than drifting downward.
    expect(bodyBottom(world)).toBeCloseTo(floorBefore, 0);
  });

  it("re-derives the same mass-tuned forces a fresh scenario would build", () => {
    const personality = {
      type: "Personality" as const,
      openness: 0.6,
      conscientiousness: 0.5,
      extraversion: 0.6,
      agreeableness: 0.5,
      neuroticism: 0.3,
    };
    const small = deriveAdoptedPetLocomotion({ width: 78, height: 78 }, personality);
    const large = deriveAdoptedPetLocomotion({ width: 156, height: 156 }, personality);

    // A 4× area body gets 4× the walk force and jump impulse so acceleration
    // matches the default body regardless of rendered size.
    expect(large.bodyMassScale).toBeCloseTo(small.bodyMassScale * 4, 5);
    expect(large.canWalk.force).toBeCloseTo(small.canWalk.force * 4, 5);
    expect(large.canJump.impulse).toBeCloseTo(small.canJump.impulse * 4, 5);
  });
});
