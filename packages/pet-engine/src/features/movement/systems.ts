import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import type { Force } from "@pets-driven/pet-engine/features/physics/systems";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

// Constants

const WALK_ARRIVAL_RADIUS = 16;
const CLIMB_DISMOUNT_COOLDOWN_MS = 700;
const WALL_CLIMB_ARRIVAL_RADIUS = 16;
const CLIMB_TARGET_X_TOLERANCE = 24;
const MOTION_ARRIVAL_RADIUS = 16;
const MOTION_SLOW_RADIUS = 96;
const JUMP_LANDING_COOLDOWN_MS = 250;
const APPROACH_JUMP_HORIZONTAL_RADIUS = WALK_ARRIVAL_RADIUS;
const APPROACH_JUMP_VERTICAL_BODY_MULTIPLIER = 1;

// Seek-user stops at this distance from the user anchor instead of walking
// onto the anchor itself. Without this, all seeking pets converge to the
// exact anchor position and pile up there during the first ~800 frames of
// the demo. Must be strictly less than USER_PROXIMITY_RADIUS (96, in behavior/
// systems.ts isNearUserAnchor) to create hysteresis — once a pet stops at
// SEEK_USER_STOP_DISTANCE, it is "near" and won't re-pick seek-user until it
// has wandered outside USER_PROXIMITY_RADIUS.
const SEEK_USER_STOP_DISTANCE = 80;

// ── MOVEMENT_STATE phase ───────────────────────────────────────────────────

export function runLocomotionModeSystem(components: ComponentStore): void {
  const occupiedSurfaces = new Set<string>();

  components.forEach(["ClimbingTag", "ContactState"], (_id, [, contact]) => {
    if (contact.climbableSurfaceId) {
      occupiedSurfaces.add(contact.climbableSurfaceId);
    }
  });

  components.forEach(["ContactState", "MotionTarget"], (id, [contact, motion]) => {
    const climbDismount = components.getComponent(id, "ClimbDismountState");
    if (climbDismount && climbDismount.phase !== "ready") {
      components.removeComponent(id, "ClimbingTag");
      if (!components.getComponent(id, "FlyingTag")) {
        components.setComponent(id, { type: "WalkingTag" });
      }
      return;
    }

    const wallClimb = components.getComponent(id, "CanWallClimb");
    if (!wallClimb) return;

    const climbIntent = components.getComponent(id, "ClimbIntentState");
    const climbing = components.getComponent(id, "ClimbingTag");
    const occupiedByAnother =
      !!contact.climbableSurfaceId && !climbing && occupiedSurfaces.has(contact.climbableSurfaceId);

    if (!occupiedByAnother && canEnterClimb(contact, motion, climbIntent)) {
      components.setComponent(id, { type: "ClimbingTag" });
      if (contact.climbableSurfaceId) {
        occupiedSurfaces.add(contact.climbableSurfaceId);
      }
    } else if (climbing && !contact.climbableSurfaceId) {
      components.removeComponent(id, "ClimbingTag");
      if (!components.getComponent(id, "FlyingTag")) {
        components.setComponent(id, { type: "WalkingTag" });
      }
    }
  });
}

// An approach that cannot complete — the pet reaches the surface x but the
// contact/attachment gate never opens — would otherwise pin the pet at the
// wall forever, visibly oscillating in the walk deadband. Cancel and let the
// decision layer (with its request-climb repeat cooldown) try again later.
//
// Measured from the last time the pet got *closer*, not from the start of the
// approach: a walk across the desktop takes longer than this budget and is not
// stuck, and cancelling it left the pet reading "Climbing" for six seconds at a
// time while never once reaching a wall.
const CLIMB_APPROACH_TIMEOUT_MS = 6_000;

// How much nearer the pet has to get for it to count as progress. Large enough
// that jitter in the walk deadband — the stall this timeout exists to catch —
// cannot keep an approach alive by twitching towards the surface.
const CLIMB_APPROACH_PROGRESS_EPSILON = 1;

export function runClimbApproachSystem(components: ComponentStore, clock?: Clock): void {
  type SurfaceEntry = { id: string; position: Vector };
  const surfaces: SurfaceEntry[] = [];

  components.forEach(["Transform", "ClimbableSurface"], (id, [transform]) => {
    surfaces.push({ id, position: transform.position });
  });

  const now = clock?.now();

  components.forEach(
    ["Transform", "MotionTarget", "ClimbIntentState", "CanWallClimb"],
    (id, [transform, motion, climbIntent]) => {
      if (components.getComponent(id, "ClimbingTag")) return;
      if (climbIntent.phase !== "approaching") return;

      const surface = surfaces.find((s) => s.id === climbIntent.surfaceEntityId);

      if (surface && now !== undefined) {
        const dx = Math.abs(surface.position.x - transform.position.x);
        if (climbIntent.closestDx === undefined) {
          // First sighting of this approach is not progress — there is nothing
          // to have improved on yet — so the stall clock is anchored to when
          // the approach began rather than reset to now. A state scripted with
          // no start time stays unanchored and never times out, as before.
          climbIntent.closestDx = dx;
          climbIntent.progressAt = climbIntent.startedAt;
        } else if (dx < climbIntent.closestDx - CLIMB_APPROACH_PROGRESS_EPSILON) {
          climbIntent.closestDx = dx;
          climbIntent.progressAt = now;
        }
      }

      const stalledSince = climbIntent.progressAt ?? climbIntent.startedAt;
      const timedOut =
        now !== undefined &&
        stalledSince !== undefined &&
        now - stalledSince > CLIMB_APPROACH_TIMEOUT_MS;
      if (!surface || timedOut) {
        components.removeComponent(id, "ClimbIntentState");
        motion.targetEntityId = null;
        motion.targetPosition = null;
        const intent = components.getComponent(id, "Steering");
        if (intent) intent.mode = "stand";
        // Refresh the request-climb repeat cooldown from *now*: the approach
        // itself consumed the whole cooldown window, so without this the pet
        // would immediately re-pick the same unclimbable surface and loop.
        if (now !== undefined) {
          const decision = components.getComponent(id, "BehaviorDecisionState");
          if (decision?.source === "autonomous" && decision.reason === "request-climb") {
            decision.decidedAt = now;
          } else if (decision?.lastAutonomousReason === "request-climb") {
            decision.lastAutonomousAt = now;
          }
        }
        return;
      }

      motion.targetEntityId = null;
      motion.targetPosition = {
        x: surface.position.x,
        y: transform.position.y,
      };
    },
  );
}

export function runClimbAttachmentSystem(
  components: ComponentStore,
  physics: MatterPhysicsWorld,
): void {
  components.forEach(
    ["ClimbingTag", "ContactState", "Transform", "MotionTarget"],
    (id, [, contact, transform, motion]) => {
      if (!contact.climbableSurfaceId || !contact.climbableSurfacePosition) return;

      const surfaceX = contact.climbableSurfacePosition.x;
      transform.position.x = surfaceX;
      physics.setPosition(id, { x: surfaceX });
      physics.setVelocity(id, { x: 0 });

      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (
        climbIntent &&
        climbIntent.phase === "approaching" &&
        climbIntent.surfaceEntityId === contact.climbableSurfaceId
      ) {
        climbIntent.phase = "attached";
        motion.targetEntityId = null;
        motion.targetPosition = { x: surfaceX, y: climbIntent.targetY };
      }
    },
  );
}

export function runClimbDismountSystem(
  components: ComponentStore,
  deltaMs: number,
  forceGroups: Force[][],
  random: RandomSource,
): void {
  const forces: Force[] = [];

  components.forEach(["MotionTarget", "ContactState"], (id, [motion, contact]) => {
    const climbDismount = components.getComponent(id, "ClimbDismountState");

    if (climbDismount?.phase === "airborne") {
      if (contact.grounded) {
        climbDismount.phase = "coolingDown";
        climbDismount.cooldownMs = CLIMB_DISMOUNT_COOLDOWN_MS;
      }
      return;
    }

    if (climbDismount?.phase === "coolingDown") {
      climbDismount.cooldownMs = Math.max(0, climbDismount.cooldownMs - deltaMs);
      if (climbDismount.cooldownMs === 0) {
        components.removeComponent(id, "ClimbDismountState");
      }
      return;
    }

    const climbing = components.getComponent(id, "ClimbingTag");
    const climbIntent = components.getComponent(id, "ClimbIntentState");

    if (
      !climbing ||
      !contact.climbableSurfaceId ||
      climbIntent?.phase === "approaching" ||
      motion.targetPosition
    ) {
      return;
    }

    components.removeComponent(id, "ClimbingTag");
    components.removeComponent(id, "ClimbIntentState");
    if (components.getComponent(id, "CanWalk")) {
      components.setComponent(id, { type: "WalkingTag" });
    }

    const canJump = components.getComponent(id, "CanJump");
    const canWallClimb = components.getComponent(id, "CanWallClimb");
    if (canJump) {
      components.setComponent(id, {
        type: "JumpActionState",
        phase: "falling",
        cooldownMs: 0,
      });
      components.setComponent(id, {
        type: "ClimbDismountState",
        phase: "airborne",
        cooldownMs: 0,
      });
      const impulse = canWallClimb?.dismountImpulse;
      if (impulse) {
        const min = Math.min(impulse.min, impulse.max);
        const max = Math.max(impulse.min, impulse.max);
        if (min < 0 || max < 0) {
          forces.push({ id, x: min + random.next() * (max - min), y: 0 });
        } else {
          const direction = random.next() < 0.5 ? -1 : 1;
          const magnitude = min + random.next() * (max - min);
          forces.push({ id, x: direction * magnitude, y: 0 });
        }
      }
    }
  });

  if (forces.length > 0) forceGroups.push(forces);
}

export function runLocomotionActiveStateSystem(components: ComponentStore): void {
  components.forEach(["ContactState"], (id, [contact]) => {
    const walking = components.getComponent(id, "WalkingTag");
    const climbing = components.getComponent(id, "ClimbingTag");
    const flying = components.getComponent(id, "FlyingTag");
    const isAirborne = walking && !climbing && !flying && !contact.grounded;

    if (isAirborne) {
      components.setComponent(id, { type: "AirborneTag" });
    } else {
      components.removeComponent(id, "AirborneTag");
    }
  });
}

// ── MOVEMENT_FORCE phase ───────────────────────────────────────────────────

export function runMotionTargetSystem(
  components: ComponentStore,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  components.forEach(["Steering", "MotionTarget"], (_id, [intent, motion]) => {
    if (intent.mode === "pursue" && motion.targetEntityId) {
      const perception = components.getComponent(_id, "Perception");
      const targetPet = perception?.nearbyPets.find((pet) => pet.id === motion.targetEntityId);
      // chase-cursor tracks the user-anchor entity the same way approach-pet
      // tracks another pet — the anchor's Transform is kept in sync with the
      // live cursor by CursorInputSystem, so this reuses the exact same
      // walker-lane projection and above-target jump request.
      const targetPosition =
        targetPet?.position ??
        (perception?.userAnchor?.id === motion.targetEntityId
          ? perception.userAnchor.position
          : undefined);
      if (targetPosition) {
        motion.targetPosition = resolveApproachPetTarget(components, _id, targetPosition);
        requestJumpWhenWalkingTargetIsAbove(components, _id, targetPosition);
      }
      return;
    }

    if (intent.mode === "arrive") {
      const perception = components.getComponent(_id, "Perception");
      const anchor = perception?.userAnchor ?? null;
      if (!anchor) {
        motion.targetEntityId = null;
        motion.targetPosition = null;
        return;
      }
      motion.targetEntityId = anchor.id;
      // Stop SEEK_USER_STOP_DISTANCE from the anchor in the pet's current
      // direction. Falls back to the anchor itself when Transform is missing.
      const transform = components.getComponent(_id, "Transform");
      if (!transform) {
        motion.targetPosition = { x: anchor.position.x, y: anchor.position.y };
        return;
      }
      const dx = transform.position.x - anchor.position.x;
      const dy = transform.position.y - anchor.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= SEEK_USER_STOP_DISTANCE) {
        // Already in social proximity — stop where we are so Arrival fires.
        motion.targetPosition = { x: transform.position.x, y: transform.position.y };
        return;
      }
      motion.targetPosition = {
        x: anchor.position.x + (dx / dist) * SEEK_USER_STOP_DISTANCE,
        y: anchor.position.y + (dy / dist) * SEEK_USER_STOP_DISTANCE,
      };
      return;
    }

    // Personality pets get their targets from BehaviorDecisionSystem.
    // MotionTargetSystem must not assign random targets for them, otherwise
    // BehaviorDecisionSystem would never see an empty target to trigger on.
    if (components.getComponent(_id, "Personality")) return;

    if (!motion.targetPosition) {
      motion.targetEntityId = null;
      const margin = 48;
      const minX = (bounds.x ?? 0) + margin;
      const minY = (bounds.y ?? 0) + margin;
      const maxX = (bounds.x ?? 0) + bounds.width - margin;
      const maxY = (bounds.y ?? 0) + bounds.height - margin;
      motion.targetPosition = {
        x: minX + (maxX - minX) * random.next(),
        y: minY + (maxY - minY) * random.next(),
      };
    }
  });
}

export function runWalkSystem(components: ComponentStore, forceGroups: Force[][]): void {
  const forces: Force[] = [];

  components.forEach(
    ["Transform", "WalkingTag", "ContactState", "CanWalk", "MotionTarget"],
    (id, [transform, , contact, canWalk, motion]) => {
      if (!contact.grounded) return;

      const target = motion.targetPosition;
      if (!target) return;

      const dx = target.x - transform.position.x;
      if (Math.abs(dx) <= WALK_ARRIVAL_RADIUS) return;

      const gait = motion.speedFactor ?? 1;
      forces.push({ id, x: Math.sign(dx) * canWalk.force * gait, y: 0 });
    },
  );

  if (forces.length > 0) forceGroups.push(forces);
}

export function runJumpSystem(
  components: ComponentStore,
  deltaMs: number,
  forceGroups: Force[][],
  random: RandomSource,
): void {
  const forces: Force[] = [];

  components.forEach(
    ["WalkingTag", "ContactState", "CanJump", "JumpActionState"],
    (id, [, contact, jump, jumpAction]) => {
      if (jumpAction.phase === "landingCooldown") {
        jumpAction.cooldownMs = Math.max(0, jumpAction.cooldownMs - deltaMs);
        if (jumpAction.cooldownMs === 0) {
          components.removeComponent(id, "JumpActionState");
        }
        return;
      }

      if (jumpAction.phase === "falling" && contact.grounded) {
        jumpAction.phase = "landingCooldown";
        jumpAction.cooldownMs = JUMP_LANDING_COOLDOWN_MS;
        return;
      }

      if (jumpAction.phase === "rising" && !contact.grounded) {
        jumpAction.phase = "falling";
        return;
      }

      if (jumpAction.phase !== "requested") return;

      if (!contact.grounded) {
        jumpAction.phase = "falling";
        return;
      }

      jumpAction.phase = "rising";
      const forwardImpulse = jump.forwardImpulse;
      let x = 0;
      if (forwardImpulse) {
        const transform = components.getComponent(id, "Transform");
        const motion = components.getComponent(id, "MotionTarget");
        const target = motion?.targetPosition;
        if (transform && target && target.x !== transform.position.x) {
          const magnitude =
            forwardImpulse.min + random.next() * (forwardImpulse.max - forwardImpulse.min);
          x = Math.sign(target.x - transform.position.x) * magnitude;
        }
      }

      forces.push({ id, x, y: -jump.impulse });
    },
  );

  if (forces.length > 0) forceGroups.push(forces);
}

export function runWallClimbSystem(components: ComponentStore, physics: MatterPhysicsWorld): void {
  components.forEach(
    ["Transform", "ClimbingTag", "CanWallClimb", "MotionTarget", "ContactState"],
    (id, [transform, , canWallClimb, motion, contact]) => {
      if (!contact.climbableSurfaceId || !motion.targetPosition) return;

      const deltaY = motion.targetPosition.y - transform.position.y;
      if (Math.abs(deltaY) <= WALL_CLIMB_ARRIVAL_RADIUS) {
        physics.setVelocity(id, { x: 0, y: 0 });
        return;
      }
      physics.setVelocity(id, { x: 0, y: Math.sign(deltaY) * canWallClimb.velocity });
    },
  );
}

export function runSteeringForceSystem(components: ComponentStore, forceGroups: Force[][]): void {
  const forces: Force[] = [];

  components.forEach(
    ["Transform", "FlyingTag", "MovementProfile", "Steering", "MotionTarget"],
    (id, [transform, , movement, intent, motion]) => {
      const target = motion.targetPosition;
      if (!target) {
        forces.push({ id, x: 0, y: 0 });
        return;
      }

      const dx = target.x - transform.position.x;
      const dy = target.y - transform.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= MOTION_ARRIVAL_RADIUS) {
        forces.push({ id, x: 0, y: 0 });
        return;
      }

      const speed =
        intent.mode === "arrive"
          ? movement.arriveForce
          : intent.mode === "pursue"
            ? movement.pursueForce
            : movement.standForce;

      const easedSpeed =
        (distance >= MOTION_SLOW_RADIUS
          ? speed
          : speed *
            ((distance - MOTION_ARRIVAL_RADIUS) / (MOTION_SLOW_RADIUS - MOTION_ARRIVAL_RADIUS))) *
        (motion.speedFactor ?? 1);

      forces.push({ id, x: (dx / distance) * easedSpeed, y: (dy / distance) * easedSpeed });
    },
  );

  if (forces.length > 0) forceGroups.push(forces);
}

export function runFlightSystem(components: ComponentStore, physics: MatterPhysicsWorld): void {
  components.forEach(["PhysicsBody", "FlyingTag", "CanFly"], (id, [, , canFly]) => {
    physics.setGravityScale(id, canFly.gravityScale);
    if (canFly.hoverStrength > 0) {
      physics.applyForce(id, { x: 0, y: -canFly.hoverStrength });
    }
  });
}

// ── TRAVEL_TRACKING (end of SIMULATE) ──────────────────────────────────────

// Records each pet's per-tick screen displacement from its own Transform, so
// the animation layer can tell "visibly travelling" from "standing" without
// reaching into the matter.js body velocity. Runs after the final transform
// sync of the tick; the first tick seeds the previous position and reports a
// zero delta.
export function runTravelTrackingSystem(components: ComponentStore): void {
  // Pets, so the animation layer can read movement from engine state rather
  // than from the physics body — and props, so the decision layer can tell a
  // ball that is rolling from one that is lying there. Listed rather than
  // derived from "everything with a body": the static boundary slabs would
  // otherwise each carry a TravelState that is zero forever.
  trackTravel(components, "PetIdentity");
  trackTravel(components, "WorldProp");
}

function trackTravel(components: ComponentStore, marker: "PetIdentity" | "WorldProp"): void {
  components.forEach([marker, "Transform"], (id, [, transform]) => {
    const { x, y } = transform.position;
    const previous = components.getComponent(id, "TravelState");
    components.setComponent(id, {
      type: "TravelState",
      previousPosition: { x, y },
      dx: previous ? x - previous.previousPosition.x : 0,
      dy: previous ? y - previous.previousPosition.y : 0,
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function canEnterClimb(
  contact: {
    climbableSurfaceId: string | null;
    climbableSurfacePosition: { x: number; y: number } | null;
  },
  motion: { targetPosition: { x: number } | null },
  climbIntent: { phase: string; surfaceEntityId: string } | undefined,
): boolean {
  if (!contact.climbableSurfaceId || !contact.climbableSurfacePosition) return false;
  /**
   * An approach the pet actually asked for is the only way into a climb.
   *
   * Without that requirement, merely *standing* near a column could start one:
   * the surface check passed on proximity and the target check passed whenever
   * the pet's ordinary walk target happened to share the column's x — which is
   * routine, since a pet walking to the side of the screen and a column pinned
   * to that same edge end up at the same place.
   *
   * A climb entered that way can never move. The target a climber rises towards
   * is set by ClimbAttachmentSystem and only from an approaching intent, so
   * WallClimbSystem has nothing to drive; the pet stands at the foot of the
   * wall wearing ClimbingTag. Worse, it stays there: BehaviorDecisionSystem
   * skips a pet that is already climbing, so it can never ask for the real
   * climb that would have freed it. That deadlock swallowed every climb the
   * claws trinket was supposed to grant.
   *
   * This also covers a stale "attached" intent from a finished climb, which
   * must not re-trigger entry either.
   */
  if (climbIntent?.phase !== "approaching") return false;
  if (contact.climbableSurfaceId !== climbIntent.surfaceEntityId) return false;
  if (!motion.targetPosition) return true;
  return (
    Math.abs(motion.targetPosition.x - contact.climbableSurfacePosition.x) <=
    CLIMB_TARGET_X_TOLERANCE
  );
}

function resolveApproachPetTarget(
  components: ComponentStore,
  id: string,
  targetPosition: Vector,
): Vector {
  const transform = components.getComponent(id, "Transform");
  const isWalking =
    !!components.getComponent(id, "WalkingTag") &&
    !components.getComponent(id, "FlyingTag") &&
    !components.getComponent(id, "ClimbingTag");

  if (!transform || !isWalking) return { ...targetPosition };
  return { x: targetPosition.x, y: transform.position.y };
}

function requestJumpWhenWalkingTargetIsAbove(
  components: ComponentStore,
  id: string,
  targetPosition: Vector,
): void {
  const transform = components.getComponent(id, "Transform");
  const body = components.getComponent(id, "PhysicsBody");
  const contact = components.getComponent(id, "ContactState");
  const canJump = components.getComponent(id, "CanJump");
  if (!transform || !body || !contact?.grounded || !canJump) return;
  if (components.getComponent(id, "JumpActionState")) return;
  if (!components.getComponent(id, "WalkingTag")) return;
  if (components.getComponent(id, "FlyingTag") || components.getComponent(id, "ClimbingTag"))
    return;

  const dx = Math.abs(targetPosition.x - transform.position.x);
  const upwardGap = transform.position.y - targetPosition.y;
  const minVerticalGap = body.height * APPROACH_JUMP_VERTICAL_BODY_MULTIPLIER;
  if (dx > APPROACH_JUMP_HORIZONTAL_RADIUS || upwardGap < minVerticalGap) return;

  components.setComponent(id, {
    type: "JumpActionState",
    phase: "requested",
    cooldownMs: 0,
  });
}

// ── System descriptors ─────────────────────────────────────────────────────

export const LocomotionModeSystem: SimulationSystem<WorldStepContext> = {
  name: "LocomotionModeSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "ContactState",
    "MotionTarget",
    "WalkingTag",
    "ClimbingTag",
    "FlyingTag",
    "ClimbIntentState",
    "CanWallClimb",
    "ClimbDismountState",
  ],
  writes: ["WalkingTag", "ClimbingTag", "FlyingTag"],
  update(ctx) {
    runLocomotionModeSystem(ctx.components);
  },
};

export const ClimbApproachSystem: SimulationSystem<WorldStepContext> = {
  name: "ClimbApproachSystem",
  dependsOn: ["LocomotionModeSystem"],
  reads: [
    "ClimbingTag",
    "Transform",
    "MotionTarget",
    "ClimbIntentState",
    "CanWallClimb",
    "ClimbableSurface",
    "Steering",
    "BehaviorDecisionState",
  ],
  writes: ["MotionTarget", "ClimbIntentState", "Steering", "BehaviorDecisionState"],
  update(ctx) {
    runClimbApproachSystem(ctx.components, ctx.clock);
  },
};

export const ClimbDismountSystem: SimulationSystem<WorldStepContext> = {
  name: "ClimbDismountSystem",
  dependsOn: ["ArrivalBehaviorSystem"],
  reads: [
    "ClimbingTag",
    "MotionTarget",
    "ContactState",
    "CanWalk",
    "CanJump",
    "CanWallClimb",
    "JumpActionState",
    "ClimbDismountState",
    "ClimbIntentState",
  ],
  writes: ["WalkingTag", "ClimbingTag", "JumpActionState", "ClimbDismountState", "PhysicsForce"],
  update(ctx) {
    runClimbDismountSystem(ctx.components, ctx.deltaMs, ctx.forceGroups, ctx.random);
  },
};

export const LocomotionActiveStateSystem: SimulationSystem<WorldStepContext> = {
  name: "LocomotionActiveStateSystem",
  dependsOn: ["ClimbDismountSystem"],
  reads: ["ContactState", "WalkingTag", "ClimbingTag", "FlyingTag"],
  writes: ["AirborneTag"],
  update(ctx) {
    runLocomotionActiveStateSystem(ctx.components);
  },
};

export const ClimbAttachmentSystem: SimulationSystem<WorldStepContext> = {
  name: "ClimbAttachmentSystem",
  dependsOn: ["LocomotionActiveStateSystem"],
  reads: ["ClimbingTag", "ContactState", "Transform", "MotionTarget", "ClimbIntentState"],
  writes: ["Transform", "MotionTarget", "PhysicsPosition", "PhysicsVelocity"],
  update(ctx) {
    runClimbAttachmentSystem(ctx.components, ctx.physics);
  },
};

export const MotionTargetSystem: SimulationSystem<WorldStepContext> = {
  name: "MotionTargetSystem",
  dependsOn: ["ClimbAttachmentSystem"],
  reads: [
    "Steering",
    "MotionTarget",
    "Transform",
    "Perception",
    "Personality",
    "WalkingTag",
    "FlyingTag",
    "ClimbingTag",
    "PhysicsBody",
    "ContactState",
    "CanJump",
    "JumpActionState",
  ],
  writes: ["MotionTarget", "JumpActionState"],
  update(ctx) {
    runMotionTargetSystem(ctx.components, ctx.random, ctx.bounds);
  },
};

export const WalkSystem: SimulationSystem<WorldStepContext> = {
  name: "WalkSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["Transform", "WalkingTag", "ContactState", "CanWalk", "MotionTarget"],
  writes: ["PhysicsForce"],
  update(ctx) {
    runWalkSystem(ctx.components, ctx.forceGroups);
  },
};

export const JumpSystem: SimulationSystem<WorldStepContext> = {
  name: "JumpSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["WalkingTag", "Transform", "MotionTarget", "ContactState", "CanJump", "JumpActionState"],
  writes: ["PhysicsForce", "JumpActionState"],
  update(ctx) {
    runJumpSystem(ctx.components, ctx.deltaMs, ctx.forceGroups, ctx.random);
  },
};

export const WallClimbSystem: SimulationSystem<WorldStepContext> = {
  name: "WallClimbSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["Transform", "ClimbingTag", "CanWallClimb", "MotionTarget", "ContactState"],
  writes: ["PhysicsVelocity"],
  update(ctx) {
    runWallClimbSystem(ctx.components, ctx.physics);
  },
};

export const SteeringForceSystem: SimulationSystem<WorldStepContext> = {
  name: "SteeringForceSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["Transform", "FlyingTag", "MovementProfile", "Steering", "MotionTarget"],
  writes: ["PhysicsForce"],
  update(ctx) {
    runSteeringForceSystem(ctx.components, ctx.forceGroups);
  },
};

export const FlightSystem: SimulationSystem<WorldStepContext> = {
  name: "FlightSystem",
  dependsOn: ["SteeringForceSystem"],
  reads: ["PhysicsBody", "FlyingTag", "CanFly"],
  writes: ["PhysicsGravityScale"],
  update(ctx) {
    runFlightSystem(ctx.components, ctx.physics);
  },
};

export const TravelTrackingSystem: SimulationSystem<WorldStepContext> = {
  name: "TravelTrackingSystem",
  dependsOn: ["PhysicsTransformSyncSystemPost"],
  reads: ["PetIdentity", "WorldProp", "Transform", "TravelState"],
  writes: ["TravelState"],
  update(ctx) {
    runTravelTrackingSystem(ctx.components);
  },
};
