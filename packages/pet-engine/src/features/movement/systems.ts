import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import type { MatterPhysicsWorld } from "@pets-driven/pet-engine/features/physics/matter-physics-world";
import type { Force } from "@pets-driven/pet-engine/features/physics/systems";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
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
const COLLISION_ESCAPE_FORCE_MULTIPLIER = 4;
const COLLISION_ESCAPE_STUCK_MS = 350;
const COLLISION_ESCAPE_STUCK_MULTIPLIER = 2;
const FALLBACK_COLLISION_ESCAPE_FORCE = 0.004;

// ── MOVEMENT_STATE phase ───────────────────────────────────────────────────

export function runLocomotionModeSystem(components: ComponentStore): void {
  const occupiedSurfaces = new Set<string>();

  components.forEach(["ClimbingTag", "ContactState"], (_id, [, contact]) => {
    if (contact.climbableSurfaceId) {
      occupiedSurfaces.add(contact.climbableSurfaceId);
    }
  });

  components.forEach(
    ["ContactState", "MotionTarget"],
    (id, [contact, motion]) => {
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
        !!contact.climbableSurfaceId &&
        !climbing &&
        occupiedSurfaces.has(contact.climbableSurfaceId);

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
    },
  );
}

export function runClimbApproachSystem(components: ComponentStore): void {
  type SurfaceEntry = { id: string; position: Vector };
  const surfaces: SurfaceEntry[] = [];

  components.forEach(["Transform", "ClimbableSurface"], (id, [transform]) => {
    surfaces.push({ id, position: transform.position });
  });

  components.forEach(
    ["Transform", "MotionTarget", "ClimbIntentState", "CanWallClimb"],
    (id, [transform, motion, climbIntent]) => {
      if (components.getComponent(id, "ClimbingTag")) return;
      if (climbIntent.phase !== "approaching") return;

      const surface = surfaces.find((s) => s.id === climbIntent.surfaceEntityId);
      if (!surface) return;

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

  components.forEach(
    ["MotionTarget", "ContactState"],
    (id, [motion, contact]) => {
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
    },
  );

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
  components.forEach(["IntentState", "MotionTarget"], (_id, [intent, motion]) => {
    if (intent.intent === "active" && motion.targetEntityId) {
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

    if (intent.intent === "seek") {
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

export function runCollisionEscapeSystem(
  components: ComponentStore,
  forceGroups: Force[][],
  clock: Clock,
): void {
  const forces: Force[] = [];
  const now = clock.now();

  components.forEach(
    ["Transform", "PhysicsBody", "PetCollision"],
    (id, [transform, , collision]) => {
      if (components.getComponent(id, "ClimbingTag")) return;

      const otherTransform = components.getComponent(collision.otherEntityId, "Transform");
      const otherPosition = otherTransform?.position ?? collision.otherPosition;
      const isWalking =
        !!components.getComponent(id, "WalkingTag") &&
        !components.getComponent(id, "FlyingTag") &&
        !components.getComponent(id, "ClimbingTag");

      const rawAway = normalize({
        x: transform.position.x - otherPosition.x,
        y: transform.position.y - otherPosition.y,
      });
      const away = isWalking
        ? {
            x: Math.abs(rawAway.x) > 0.2 ? Math.sign(rawAway.x) : fallbackHorizontalDirection(id, collision.otherEntityId),
            y: 0,
          }
        : rawAway;

      const walk = components.getComponent(id, "CanWalk");
      const movement = components.getComponent(id, "MovementProfile");
      const baseForce =
        walk?.force ??
        movement?.activeForce ??
        FALLBACK_COLLISION_ESCAPE_FORCE / COLLISION_ESCAPE_FORCE_MULTIPLIER;
      // Overlapping with the session partner still separates the bodies, but
      // gently — the 4x shove (and stuck escalation) between two pets who are
      // deliberately standing close reads as them fighting.
      const sessionMember = components.getComponent(id, "SocialSessionMember");
      const isSessionPartner =
        sessionMember?.partnerId === collision.otherEntityId;
      const stuckMultiplier =
        now - collision.startedAt >= COLLISION_ESCAPE_STUCK_MS
          ? COLLISION_ESCAPE_STUCK_MULTIPLIER
          : 1;
      const force = isSessionPartner
        ? baseForce
        : baseForce * COLLISION_ESCAPE_FORCE_MULTIPLIER * stuckMultiplier;
      forces.push({ id, x: away.x * force, y: away.y * force });
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
            forwardImpulse.min +
            random.next() * (forwardImpulse.max - forwardImpulse.min);
          x = Math.sign(target.x - transform.position.x) * magnitude;
        }
      }

      forces.push({ id, x, y: -jump.impulse });
    },
  );

  if (forces.length > 0) forceGroups.push(forces);
}

export function runWallClimbSystem(
  components: ComponentStore,
  physics: MatterPhysicsWorld,
): void {
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

export function runIntentSteeringSystem(
  components: ComponentStore,
  forceGroups: Force[][],
): void {
  const forces: Force[] = [];

  components.forEach(
    ["Transform", "FlyingTag", "MovementProfile", "IntentState", "MotionTarget"],
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
        intent.intent === "seek"
          ? movement.seekForce
          : intent.intent === "active"
            ? movement.activeForce
            : movement.idleForce;

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

export function runFlightSystem(
  components: ComponentStore,
  physics: MatterPhysicsWorld,
): void {
  components.forEach(["PhysicsBody", "FlyingTag", "CanFly"], (id, [, , canFly]) => {
    physics.setGravityScale(id, canFly.gravityScale);
    if (canFly.hoverStrength > 0) {
      physics.applyForce(id, { x: 0, y: -canFly.hoverStrength });
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function canEnterClimb(
  contact: { climbableSurfaceId: string | null; climbableSurfacePosition: { x: number; y: number } | null },
  motion: { targetPosition: { x: number } | null },
  climbIntent: { phase: string; surfaceEntityId: string } | undefined,
): boolean {
  if (!contact.climbableSurfaceId || !contact.climbableSurfacePosition) return false;
  // A stale "attached" intent from a completed climb must not re-trigger entry.
  // Only an explicit "approaching" request (from BehaviorDecisionSystem) opens
  // the gate. Undefined climbIntent is allowed for legacy/non-preference pets.
  if (climbIntent && climbIntent.phase !== "approaching") return false;
  if (climbIntent && contact.climbableSurfaceId !== climbIntent.surfaceEntityId) return false;
  if (!motion.targetPosition) return true;
  return (
    Math.abs(motion.targetPosition.x - contact.climbableSurfacePosition.x) <= CLIMB_TARGET_X_TOLERANCE
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
  if (components.getComponent(id, "FlyingTag") || components.getComponent(id, "ClimbingTag")) return;

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

function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function fallbackHorizontalDirection(id: string, otherId: string | undefined): -1 | 1 {
  if (!otherId) return -1;
  return id.localeCompare(otherId) <= 0 ? -1 : 1;
}

// ── System descriptors ─────────────────────────────────────────────────────

export const LocomotionModeSystem: SimulationSystem<WorldStepContext> = {
  name: "LocomotionModeSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: ["ContactState", "MotionTarget", "WalkingTag", "ClimbingTag", "FlyingTag", "ClimbIntentState", "CanWallClimb", "ClimbDismountState"],
  writes: ["WalkingTag", "ClimbingTag", "FlyingTag"],
  update(ctx) {
    runLocomotionModeSystem(ctx.components);
  },
};

export const ClimbApproachSystem: SimulationSystem<WorldStepContext> = {
  name: "ClimbApproachSystem",
  dependsOn: ["LocomotionModeSystem"],
  reads: ["ClimbingTag", "Transform", "MotionTarget", "ClimbIntentState", "CanWallClimb", "ClimbableSurface"],
  writes: ["MotionTarget"],
  update(ctx) {
    runClimbApproachSystem(ctx.components);
  },
};

export const ClimbDismountSystem: SimulationSystem<WorldStepContext> = {
  name: "ClimbDismountSystem",
  dependsOn: ["ArrivalBehaviorSystem"],
  reads: ["ClimbingTag", "MotionTarget", "ContactState", "CanWalk", "CanJump", "CanWallClimb", "JumpActionState", "ClimbDismountState", "ClimbIntentState"],
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
  reads: ["IntentState", "MotionTarget", "Transform", "Perception", "Personality", "WalkingTag", "FlyingTag", "ClimbingTag", "PhysicsBody", "ContactState", "CanJump", "JumpActionState"],
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

export const CollisionEscapeSystem: SimulationSystem<WorldStepContext> = {
  name: "CollisionEscapeSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: [
    "Transform",
    "PhysicsBody",
    "PetCollision",
    "WalkingTag",
    "FlyingTag",
    "ClimbingTag",
    "CanWalk",
    "MovementProfile",
    "SocialSessionMember",
  ],
  writes: ["PhysicsForce"],
  update(ctx) {
    runCollisionEscapeSystem(ctx.components, ctx.forceGroups, ctx.clock);
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

export const IntentSteeringSystem: SimulationSystem<WorldStepContext> = {
  name: "IntentSteeringSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["Transform", "FlyingTag", "MovementProfile", "IntentState", "MotionTarget"],
  writes: ["PhysicsForce"],
  update(ctx) {
    runIntentSteeringSystem(ctx.components, ctx.forceGroups);
  },
};

export const FlightSystem: SimulationSystem<WorldStepContext> = {
  name: "FlightSystem",
  dependsOn: ["IntentSteeringSystem"],
  reads: ["PhysicsBody", "FlyingTag", "CanFly"],
  writes: ["PhysicsGravityScale"],
  update(ctx) {
    runFlightSystem(ctx.components, ctx.physics);
  },
};
