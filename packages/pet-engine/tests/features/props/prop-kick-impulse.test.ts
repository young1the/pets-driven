import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { BALL_RADIUS } from "@pets-driven/pet-engine/features/props/components";
import { runPropKickSystem } from "@pets-driven/pet-engine/features/props/systems";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import { describe, expect, it } from "vitest";

/**
 * The kick as an impulse.
 *
 * prop-ball.test.ts asks whether a pet living its own life ever gets the ball
 * moving. These ask the narrower question the collision maths owes an answer
 * to: who was closing on whom, how much each side is charged for it, and
 * whether the ball keeps what it arrived with. Contact here is hand-placed and
 * the velocities are hand-written, because "a ball rolling at a pet that is
 * standing perfectly still" is not a situation a wandering pet reliably
 * produces.
 */

const BALL_ID = "prop-ball";
const PET_ID = "pet-a";

/** A pet and a ball in contact, each moving exactly as fast as the test says. */
function contact(options: {
  petAt: { x: number; y: number };
  ballAt: { x: number; y: number };
  petTravel?: { dx: number; dy: number };
  ballTravel?: { dx: number; dy: number };
}) {
  const petTravel = options.petTravel ?? { dx: 0, dy: 0 };
  const ballTravel = options.ballTravel ?? { dx: 0, dy: 0 };
  return createComponentStore([
    {
      id: PET_ID,
      components: [
        { type: "PetIdentity" as const, name: "Alice" },
        { type: "Transform" as const, position: options.petAt },
        { type: "PhysicsBody" as const, shape: "rectangle" as const, width: 32, height: 38 },
        { type: "TravelState" as const, previousPosition: options.petAt, ...petTravel },
      ],
    },
    {
      id: BALL_ID,
      components: [
        {
          type: "WorldProp" as const,
          kind: "ball" as const,
          spawnedAt: 0,
          lastKickBy: null,
          lastKickAt: 0,
        },
        { type: "Transform" as const, position: options.ballAt },
        {
          type: "PhysicsBody" as const,
          shape: "circle" as const,
          width: BALL_RADIUS * 2,
          height: BALL_RADIUS * 2,
        },
        { type: "TravelState" as const, previousPosition: options.ballAt, ...ballTravel },
      ],
    },
  ]);
}

function kick(store: ReturnType<typeof contact>) {
  runPropKickSystem(store, createManualClock(1000), createSeededRandom(7));
  return {
    ball: store.getComponent(BALL_ID, "ThrowImpulse"),
    pet: store.getComponent(PET_ID, "ThrowImpulse"),
    kicked: store.getComponent(BALL_ID, "WorldProp")?.lastKickAt !== 0,
  };
}

/** Level contact: a pet standing shoulder-to-shoulder with the ball. */
const LEVEL = { petAt: { x: 100, y: 200 }, ballAt: { x: 124, y: 200 } };

describe("a kick is an impulse, not a decree", () => {
  it("adds to the ball's velocity rather than replacing it", () => {
    const result = kick(contact({ ...LEVEL, petTravel: { dx: 2.1, dy: 0 } }));

    // The regression: this used to be a plain "set", so whatever the ball was
    // already doing was discarded at the moment of contact and a ball booted
    // from behind while rolling came out slower than it went in.
    expect(result.ball?.mode).toBe("add");
    expect(result.ball?.velocity.x).toBeGreaterThan(0);
  });

  it("charges the pet for what the ball takes, in proportion to their masses", () => {
    const result = kick(contact({ ...LEVEL, petTravel: { dx: 2.1, dy: 0 } }));

    // Newton's other half: opposite in direction, and small, because a pet is
    // some forty times the mass of a hollow ball. A pet that ricocheted off its
    // own football would be the wrong kind of honest.
    expect(result.pet?.mode).toBe("add");
    expect(result.pet?.velocity.x).toBeLessThan(0);
    expect(Math.abs(result.pet?.velocity.x ?? 0)).toBeLessThan(
      Math.abs(result.ball?.velocity.x ?? 0) / 20,
    );
  });

  it("leaves a throw the user aimed alone", () => {
    const store = contact({ ...LEVEL, petTravel: { dx: 2.1, dy: 0 } });
    store.setComponent(PET_ID, { type: "ThrowImpulse", velocity: { x: 30, y: -20 } });

    runPropKickSystem(store, createManualClock(1000), createSeededRandom(7));

    expect(store.getComponent(PET_ID, "ThrowImpulse")).toEqual({
      type: "ThrowImpulse",
      velocity: { x: 30, y: -20 },
    });
  });
});

describe("who is closing on whom", () => {
  it("bounces a ball that rolls into a pet standing perfectly still", () => {
    // The reported gap: the kick read the pet's own travel only, so a pet in
    // the path of a rolling ball was scenery the ball passed through.
    const result = kick(contact({ ...LEVEL, ballTravel: { dx: -8, dy: 0 } }));

    expect(result.kicked).toBe(true);
    // The impulse is additive, so what the ball ends up doing is the sum. Sent
    // back the way it came, and at less than it arrived with: the contact has
    // restitution below 1, so this half of the impulse only ever loses energy
    // and a ball rattling between two motionless pets settles.
    const outgoing = -8 + (result.ball?.velocity.x ?? 0);
    expect(outgoing).toBeGreaterThan(0);
    expect(outgoing).toBeLessThan(8);
  });

  it("leaves a ball alone when it is already outrunning the pet", () => {
    // Same direction, ball faster: the gap is widening, so there is nothing to
    // kick. Reading the pet's speed in isolation called this a kick and then
    // wrote a slower velocity over a faster one.
    const result = kick(
      contact({ ...LEVEL, petTravel: { dx: 3, dy: 0 }, ballTravel: { dx: 12, dy: 0 } }),
    );

    expect(result.kicked).toBe(false);
    expect(result.ball).toBeUndefined();
  });

  it("still ignores a resting ball beside a motionless pet", () => {
    // The older guarantee, unchanged: contact is not a kick. Without it a pet
    // parked beside the ball twitches it every cooldown forever.
    expect(kick(contact(LEVEL)).kicked).toBe(false);
  });
});

describe("a pet that comes down on the ball", () => {
  /** Pet directly overhead, falling: no horizontal travel at all. */
  const STOMP = {
    petAt: { x: 300, y: 176 },
    ballAt: { x: 300, y: 200 },
    petTravel: { dx: 0, dy: 7 },
  };

  it("sends it out sideways instead of doing nothing", () => {
    // Vertical travel used not to count. The honest objection was that
    // squashing the ball downward has nowhere to go from the floor — true of
    // the impulse, false of the contact, since the floor answers with a normal
    // impulse of its own and the ball goes out the side.
    const result = kick(contact(STOMP));

    expect(result.kicked).toBe(true);
    expect(Math.abs(result.ball?.velocity.x ?? 0)).toBeGreaterThan(1);
  });

  it("pops it up rather than driving it into the floor", () => {
    const result = kick(contact(STOMP));

    expect(result.ball?.velocity.y).toBeLessThan(0);
  });
});
