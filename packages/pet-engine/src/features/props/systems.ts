import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import { clampDrive } from "@pets-driven/pet-engine/features/drives/systems";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import {
  BALL_KICK_RADIUS,
  PROP_KICK_BOOT,
  PROP_KICK_COOLDOWN_MS,
  PROP_KICK_CUE_MS,
  PROP_KICK_CURIOSITY_RELIEF,
  PROP_KICK_JITTER,
  PROP_KICK_LIFT_BASE,
  PROP_KICK_LIFT_PER_SPEED,
  PROP_KICK_MAX_SPEED,
  PROP_KICK_MIN_CLOSING,
  PROP_KICK_MIN_LATERAL,
  PROP_KICK_PET_DENSITY,
  PROP_KICK_PROP_DENSITY,
  PROP_KICK_RESTITUTION,
  PROP_KICK_STOMP_REDIRECT,
} from "@pets-driven/pet-engine/features/props/components";
import { DEFAULT_PET_BODY_SIZE } from "@pets-driven/pet-engine/pets/constants/pet-body";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * The one system props own: a pet that walks into the ball kicks it.
 *
 * It applies no force itself. The kick is written as an additive `ThrowImpulse`
 * on the *ball* and an equal one back on the pet, and ThrowImpulseSystem —
 * which has always existed to launch a pet the user flicked across the desktop,
 * and which queries the component, not the entity — turns them into velocity in
 * POST_UPDATE. So a kick and a throw reach the physics layer through the same
 * door, and the ball inherits the wall-tunnelling safeguards that path already
 * carries.
 *
 * Contact is geometric rather than physical for the same reason pet-to-pet
 * contact is (see PetCollisionSyncSystem): the ball's collision mask excludes
 * pets, so matter.js will never resolve this pair on its own. Everything else
 * about the ball — falling, bouncing off the walls, rolling, settling — is
 * matter.js; only this one contact is ours, which is what lets it carry a
 * cooldown, a mood change, and a cue. What it is *not* any more is a decree:
 * kickProp resolves it as a real impulse, so the ball keeps the momentum it
 * arrived with and the pet pays for what it takes.
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
    const petMass = bodyMass(petBody, PROP_KICK_PET_DENSITY, DEFAULT_PET_BODY_SIZE);

    for (const entry of props) {
      const [prop, propTransform] = entry.components;
      // Course scenery, not a toy. A hurdle shares everything else a prop has
      // — a body, a floor to stand on, a window to be drawn in — but a pet
      // dribbling the obstacle it is supposed to jump is not a game.
      if (components.getComponent(entry.id, "GameObstacle")) continue;
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
      if (!kickProp(components, petId, entry.id, { dx, dy }, petMass, now, random)) continue;
      // One prop per pet per tick, matching ItemPickupSystem: a pet wedged
      // between two of them takes the second on the next tick, with its own cue.
      break;
    }
  });
}

/**
 * Resolve one pet-to-prop contact as an impulse, and let the pet enjoy it.
 *
 * The whole exchange happens along the contact normal `n`, the line from the
 * pet's centre to the prop's, and it is an ordinary collision impulse:
 *
 *     j = ((1 + restitution) * closing + boot * petClosing) * reducedMass
 *
 * `closing` is *relative* — how fast the gap along `n` is actually shrinking,
 * counting both bodies. That is what earns the two behaviors this used to be
 * missing: a pet standing in the path of a rolling ball now bounces it, because
 * the ball is doing the closing, and a pet dropping onto the ball connects,
 * because the normal has a vertical component to close along. Restitution below
 * 1 makes that term strictly dissipative, so nothing here can feed itself.
 *
 * `boot` is priced off `petClosing`, the pet's own velocity along `n` and never
 * the prop's, and it is the part that is a pet *kicking* rather than a pet
 * merely being in the way. Keeping the amplified term off the ball's own speed
 * is what stops a ball loose among several pets from climbing to the cap in a
 * couple of bounces.
 *
 * Both sides are paid. The prop takes `j / propMass` and the pet takes the same
 * impulse back at `j / petMass` — a check in its stride rather than a ricochet,
 * because a pet is some forty times the mass of a hollow ball. That reaction is
 * the difference between a transfer and a decree, and it is skipped only when a
 * throw already owns the pet's velocity this tick.
 *
 * A pet standing dead centre on the ball has no gap to read, so the side is
 * drawn from the seeded random rather than left at zero — a kick that goes
 * nowhere would trap the ball under the pet until the cooldown expired, over
 * and over. The same bias, applied to every contact, is what gives a stomp
 * somewhere lateral to go.
 */
function kickProp(
  components: ComponentStore,
  petId: string,
  propId: string,
  gap: { dx: number; dy: number },
  petMass: number,
  now: number,
  random: RandomSource,
): boolean {
  const roll = random.next();

  // The contact normal, pet to prop, with a floor under its horizontal part: a
  // normal pointing straight down is a kick into the ground, which the floor
  // simply eats. See PROP_KICK_MIN_LATERAL.
  const side = Math.abs(gap.dx) < 1 ? (roll < 0.5 ? -1 : 1) : Math.sign(gap.dx);
  const lateral = Math.max(Math.abs(gap.dx), PROP_KICK_MIN_LATERAL) * side;
  const length = Math.hypot(lateral, gap.dy) || 1;
  const nx = lateral / length;
  const ny = gap.dy / length;

  // TravelState is the engine's own per-tick displacement, in the same pixels
  // per tick matter.js measures velocity in, so this reads movement from
  // simulation state rather than from the physics body. Props carry one too —
  // TravelTrackingSystem tracks them precisely so a rolling ball can be told
  // from a resting one.
  const petTravel = components.getComponent(petId, "TravelState");
  const propTravel = components.getComponent(propId, "TravelState");
  const petVx = petTravel?.dx ?? 0;
  const petVy = petTravel?.dy ?? 0;
  const closing = (petVx - (propTravel?.dx ?? 0)) * nx + (petVy - (propTravel?.dy ?? 0)) * ny;
  if (closing < PROP_KICK_MIN_CLOSING) return false;
  const petClosing = Math.max(0, petVx * nx + petVy * ny);

  const propMass = bodyMass(components.getComponent(propId, "PhysicsBody"), PROP_KICK_PROP_DENSITY);
  const reducedMass = 1 / (1 / petMass + 1 / propMass);
  const impulse =
    ((1 + PROP_KICK_RESTITUTION) * closing + PROP_KICK_BOOT * petClosing) *
    reducedMass *
    (1 + (roll - 0.5) * PROP_KICK_JITTER);

  const propDelta = Math.min(PROP_KICK_MAX_SPEED, impulse / propMass);
  let vx = propDelta * nx;
  let vy = propDelta * ny;

  // The floor's half of a stomp. Driving the prop downward is the one direction
  // with nothing to give: the ground answers with a normal impulse, and a ball
  // squashed between a paw and the floor goes out the side instead.
  if (vy > 0) {
    vx += side * vy * PROP_KICK_STOMP_REDIRECT;
    vy = 0;
  }
  vy -= PROP_KICK_LIFT_BASE + petClosing * PROP_KICK_LIFT_PER_SPEED;

  components.setComponent(propId, {
    type: "ThrowImpulse",
    mode: "add",
    velocity: { x: vx, y: vy },
  });

  // Newton's other half. Skipped when the pet already carries an impulse this
  // tick — that is the user's throw, and a kick is not entitled to edit it.
  if (!components.getComponent(petId, "ThrowImpulse")) {
    const petDelta = Math.min(PROP_KICK_MAX_SPEED, impulse / petMass);
    components.setComponent(petId, {
      type: "ThrowImpulse",
      mode: "add",
      velocity: { x: -petDelta * nx, y: -petDelta * ny },
    });
  }

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

/**
 * What the kick weighs a body at: its own footprint times a density.
 *
 * Deliberately not matter.js's `body.mass`. Reading that would make this the
 * one behavior system that reaches into the physics library, and it would tie
 * the feel of a kick to a density picked for how bodies fall. Only the ratio
 * between the two masses matters here, and the two densities set it.
 */
function bodyMass(
  body: { shape: "rectangle" | "circle"; width: number; height: number } | undefined,
  density: number,
  fallback: { width: number; height: number } = { width: 1, height: 1 },
): number {
  if (!body) return fallback.width * fallback.height * density;
  const area = body.shape === "circle" ? Math.PI * (body.width / 2) ** 2 : body.width * body.height;
  return Math.max(area, 1) * density;
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
