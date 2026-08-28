import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import { clampDrive } from "@pets-driven/pet-engine/features/drives/systems";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import {
  BALL_KICK_RADIUS,
  PROP_KICK_COOLDOWN_MS,
  PROP_KICK_CUE_MS,
  PROP_KICK_CURIOSITY_RELIEF,
  PROP_KICK_JITTER,
  PROP_KICK_LIFT_BASE,
  PROP_KICK_LIFT_PER_SPEED,
  PROP_KICK_MAX_SPEED,
  PROP_KICK_MIN_CLOSING,
  PROP_KICK_NUDGE,
  PROP_KICK_TRANSFER,
} from "@pets-driven/pet-engine/features/props/components";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * The one system props own: a pet that walks into the ball kicks it.
 *
 * It applies no force itself. The kick is written as a `ThrowImpulse` on the
 * *ball*, and ThrowImpulseSystem — which has always existed to launch a pet the
 * user flicked across the desktop, and which queries the component, not the
 * entity — turns it into velocity in POST_UPDATE. So a kick and a throw are
 * literally the same event as far as the physics layer is concerned, and the
 * ball inherits the wall-tunnelling safeguards that path already carries.
 *
 * Contact is geometric rather than physical for the same reason pet-to-pet
 * contact is (see PetCollisionSyncSystem): the ball's collision mask excludes
 * pets, so nothing is ever pushed by a body. A kick is a decision this system
 * makes about an overlap, which is what lets it carry a cooldown, a mood
 * change, and a cue instead of being a silent transfer of momentum.
 *
 * Not gated on Quiet Mode. `still` parks a pet where it stands but leaves it
 * pick-up-able and throwable — a pet the user lobs into the ball has not
 * intruded on anyone, and a stilled pet never walks into one on its own because
 * BehaviorDecisionSystem stops choosing `chase-prop` at that level.
 */
export function runPropKickSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
): void {
  const props = components.query("WorldProp", "Transform", "PhysicsBody");
  if (props.length === 0) return;

  const now = clock.now();

  components.forEach(["PetIdentity", "Transform"], (petId, [, petTransform]) => {
    const petBody = components.getComponent(petId, "PhysicsBody");
    const halfWidth = petBody ? petBody.width / 2 : 0;
    const halfHeight = petBody ? petBody.height / 2 : 0;

    for (const entry of props) {
      const [prop, propTransform] = entry.components;
      if (prop.lastKickBy === petId && now - prop.lastKickAt < PROP_KICK_COOLDOWN_MS) {
        continue;
      }

      const dx = propTransform.position.x - petTransform.position.x;
      const dy = propTransform.position.y - petTransform.position.y;
      if (Math.abs(dx) > BALL_KICK_RADIUS + halfWidth) continue;
      if (Math.abs(dy) > BALL_KICK_RADIUS + halfHeight) continue;

      // Overlapping is not yet a kick — kickProp decides that from the
      // closing speed, and a pet merely standing beside the ball gets no turn
      // taken and no cooldown started, so it is free to connect the moment it
      // actually moves into it.
      if (!kickProp(components, petId, entry.id, dx, now, random)) continue;
      // One prop per pet per tick, matching ItemPickupSystem: a pet wedged
      // between two of them takes the second on the next tick, with its own cue.
      break;
    }
  });
}

/**
 * Send one prop away from one pet and let the pet enjoy it.
 *
 * The ball leaves along the line from the pet to it — the contact normal — at a
 * speed set by how fast the pet was actually closing on that line. Projecting
 * the pet's own travel onto the normal is what makes a run-down feel different
 * from an amble and a stroll-past barely disturb it: a pet moving away from the
 * ball transfers nothing and the ball only gets the nudge.
 *
 * Horizontal travel only. A pet dropping onto a ball from above is closing on
 * it too, but nothing about that says the ball should shoot sideways, and the
 * honest alternative — squashing it downward — has nowhere to go from the floor.
 *
 * A pet standing dead centre on the ball has no gap to read, so the side is
 * drawn from the seeded random rather than left at zero — a kick that goes
 * nowhere would trap the ball under the pet until the cooldown expired, over
 * and over.
 */
function kickProp(
  components: ComponentStore,
  petId: string,
  propId: string,
  dx: number,
  now: number,
  random: RandomSource,
): boolean {
  const roll = random.next();
  const direction = Math.abs(dx) < 1 ? (roll < 0.5 ? -1 : 1) : Math.sign(dx);

  // The *pet's* own speed toward the ball, and deliberately not the speed the
  // gap is closing at. Folding the ball's velocity in looks more physical and
  // is a trap: the ball's speed would then feed its own next kick, five times
  // over, and a ball loose among several pets amplifies itself to the cap in a
  // couple of bounces. Kicking is something a pet does, so only the pet's
  // motion pays for it. TravelState is the engine's own per-tick displacement,
  // so this reads movement from simulation state rather than the physics body.
  const petTravel = components.getComponent(petId, "TravelState");
  const closingSpeed = Math.max(0, (petTravel?.dx ?? 0) * direction);
  if (closingSpeed < PROP_KICK_MIN_CLOSING) return false;

  const speed = Math.min(
    PROP_KICK_MAX_SPEED,
    (PROP_KICK_NUDGE + closingSpeed * PROP_KICK_TRANSFER) * (1 + (roll - 0.5) * PROP_KICK_JITTER),
  );

  components.setComponent(propId, {
    type: "ThrowImpulse",
    velocity: {
      x: direction * speed,
      y: -(PROP_KICK_LIFT_BASE + closingSpeed * PROP_KICK_LIFT_PER_SPEED),
    },
  });

  const prop = components.getComponent(propId, "WorldProp");
  if (prop) {
    prop.lastKickBy = petId;
    prop.lastKickAt = now;
  }

  components.setComponent(petId, {
    type: "PetExpressionState",
    source: "prop",
    mood: "excited",
    emote: "sparkle",
    label: null,
    startedAt: now,
    expiresAt: now + PROP_KICK_CUE_MS,
  });

  recordPetExperience(components, petId, "played", now);

  const drives = components.getComponent(petId, "Drives");
  if (drives) {
    drives.curiosity = clampDrive(drives.curiosity - PROP_KICK_CURIOSITY_RELIEF);
  }

  return true;
}

// ── System descriptor ──────────────────────────────────────────────────────

export const PropKickSystem: SimulationSystem<WorldStepContext> = {
  name: "PropKickSystem",
  dependsOn: ["PetCollisionSyncSystem"],
  reads: ["WorldProp", "Transform", "PhysicsBody", "PetIdentity", "TravelState", "Drives"],
  writes: [
    "WorldProp",
    "ThrowImpulse",
    "PetExpressionState",
    "MoodState",
    "RecentExperienceMemory",
    "Drives",
  ],
  update(ctx) {
    runPropKickSystem(ctx.components, ctx.clock, ctx.random);
  },
};
