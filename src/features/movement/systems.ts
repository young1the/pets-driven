import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { MatterPhysicsWorld } from "@/features/physics/matter-physics-world";
import type { Force } from "@/features/physics/systems";
import type { Vector } from "@/features/physics/components";
import type { RandomSource } from "@/shared/random/seeded-random";

// Constants

const WALK_ARRIVAL_RADIUS = 16;
const CLIMB_DISMOUNT_COOLDOWN_MS = 700;
const WALL_CLIMB_ARRIVAL_RADIUS = 16;
const CLIMB_TARGET_X_TOLERANCE = 24;
const MOTION_ARRIVAL_RADIUS = 16;
const MOTION_SLOW_RADIUS = 96;
const JUMP_LANDING_COOLDOWN_MS = 250;

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

      if (canEnterClimb(contact, motion, climbIntent)) {
        components.setComponent(id, { type: "ClimbingTag" });
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
): void {
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
      }
    },
  );
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
  bounds: { width: number; height: number },
): void {
  components.forEach(["IntentState", "MotionTarget"], (_id, [intent, motion]) => {
    if (intent.intent === "active" && motion.targetEntityId) {
      const perception = components.getComponent(_id, "Perception");
      const targetPet = perception?.nearbyPets.find((pet) => pet.id === motion.targetEntityId);
      if (targetPet) {
        motion.targetPosition = { ...targetPet.position };
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
      motion.targetPosition = {
        x: margin + (bounds.width - margin * 2) * random.next(),
        y: margin + (bounds.height - margin * 2) * random.next(),
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

      forces.push({ id, x: Math.sign(dx) * canWalk.force, y: 0 });
    },
  );

  if (forces.length > 0) forceGroups.push(forces);
}

export function runJumpSystem(
  components: ComponentStore,
  deltaMs: number,
  forceGroups: Force[][],
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
      forces.push({ id, x: 0, y: -jump.impulse });
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
        distance >= MOTION_SLOW_RADIUS
          ? speed
          : speed *
            ((distance - MOTION_ARRIVAL_RADIUS) / (MOTION_SLOW_RADIUS - MOTION_ARRIVAL_RADIUS));

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
  reads: ["ClimbingTag", "MotionTarget", "ContactState", "CanWalk", "CanJump", "JumpActionState", "ClimbDismountState", "ClimbIntentState"],
  writes: ["WalkingTag", "ClimbingTag", "JumpActionState", "ClimbDismountState"],
  update(ctx) {
    runClimbDismountSystem(ctx.components, ctx.deltaMs);
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
  reads: ["IntentState", "MotionTarget", "Transform", "Perception", "Personality"],
  writes: ["MotionTarget"],
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
  reads: ["WalkingTag", "ContactState", "CanJump", "JumpActionState"],
  writes: ["PhysicsForce", "JumpActionState"],
  update(ctx) {
    runJumpSystem(ctx.components, ctx.deltaMs, ctx.forceGroups);
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
