import type { ComponentStore } from "@/core/component-store";
import type { SimulationComponentType } from "@/core/components";
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

const ACTIVE_LOCOMOTION_TAGS: SimulationComponentType[] = [
  "WalkingState",
  "ClimbingState",
  "FlyingState",
];

// ── MOVEMENT_STATE phase ───────────────────────────────────────────────────

export function runLocomotionModeSystem(components: ComponentStore): void {
  components.query(
    ["ContactState", "MotionTarget"],
    (id, [contact, motion]) => {
      const climbDismount = components.getComponent(id, "ClimbDismountState");
      if (climbDismount && climbDismount.phase !== "ready") {
        if (components.getComponent(id, "ClimbingState")) {
          switchLocomotion(id, "walk", components);
        }
        return;
      }

      const wallClimb = components.getComponent(id, "CanWallClimb");
      if (!wallClimb) return;

      const climbIntent = components.getComponent(id, "ClimbIntentState");
      const climbing = components.getComponent(id, "ClimbingState");

      if (canEnterClimb(contact, motion, climbIntent)) {
        switchLocomotion(id, "climb", components);
      } else if (climbing && !contact.climbableSurfaceId) {
        switchLocomotion(id, "walk", components);
      }
    },
  );
}

export function runClimbApproachSystem(components: ComponentStore): void {
  type SurfaceEntry = { id: string; position: Vector };
  const surfaces: SurfaceEntry[] = [];

  components.query(["Transform", "ClimbableSurface"], (id, [transform]) => {
    surfaces.push({ id, position: transform.position });
  });

  components.query(
    ["Transform", "MotionTarget", "ClimbIntentState", "CanWallClimb"],
    (id, [transform, motion, climbIntent]) => {
      if (components.getComponent(id, "ClimbingState")) return;
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
  components.query(
    ["ClimbingState", "ContactState", "Transform", "MotionTarget"],
    (id, [, contact, transform, motion]) => {
      if (!contact.climbableSurfaceId || !contact.climbableSurfacePosition) return;

      const surfaceX = contact.climbableSurfacePosition.x;
      transform.position.x = surfaceX;
      physics.setPosition(id, { x: surfaceX });
      physics.setVelocity(id, { x: 0 });

      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (climbIntent && climbIntent.surfaceEntityId === contact.climbableSurfaceId) {
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
  components.query(
    ["MotionTarget", "ContactState", "CanWalk", "CanWallClimb", "CanJump", "JumpActionState", "ClimbDismountState"],
    (id, [motion, contact, , , , jumpAction, climbDismount]) => {
      if (climbDismount.phase === "airborne") {
        if (contact.grounded) {
          climbDismount.phase = "coolingDown";
          climbDismount.cooldownMs = CLIMB_DISMOUNT_COOLDOWN_MS;
        }
        return;
      }

      if (climbDismount.phase === "coolingDown") {
        climbDismount.cooldownMs = Math.max(0, climbDismount.cooldownMs - deltaMs);
        if (climbDismount.cooldownMs === 0) climbDismount.phase = "ready";
        return;
      }

      const climbing = components.getComponent(id, "ClimbingState");
      const climbIntent = components.getComponent(id, "ClimbIntentState");

      if (
        !climbing ||
        !contact.climbableSurfaceId ||
        climbIntent?.phase === "approaching" ||
        motion.targetPosition
      ) {
        return;
      }

      components.removeComponent(id, "ClimbingState");
      components.setComponent(id, { type: "WalkingState" });
      jumpAction.phase = "falling";
      jumpAction.cooldownMs = 0;
      climbDismount.phase = "airborne";
      climbDismount.cooldownMs = 0;
    },
  );
}

export function runLocomotionActiveStateSystem(components: ComponentStore): void {
  components.query(["ContactState"], (id, [contact]) => {
    const walking = components.getComponent(id, "WalkingState");
    const climbing = components.getComponent(id, "ClimbingState");
    const flying = components.getComponent(id, "FlyingState");
    const isAirborne = walking && !climbing && !flying && !contact.grounded;

    if (isAirborne) {
      components.setComponent(id, { type: "AirborneState" });
    } else {
      components.removeComponent(id, "AirborneState");
    }
  });
}

// ── MOVEMENT_FORCE phase ───────────────────────────────────────────────────

export function runMotionTargetSystem(
  components: ComponentStore,
  random: RandomSource,
  bounds: { width: number; height: number },
): void {
  type AnchorEntry = { id: string; x: number; y: number };
  const anchors: AnchorEntry[] = [];

  components.query(["Transform", "UserAnchor"], (id, [transform]) => {
    anchors.push({ id, x: transform.position.x, y: transform.position.y });
  });

  const anchor = anchors[0];

  components.query(["IntentState", "MotionTarget"], (_id, [intent, motion]) => {
    if (intent.intent === "seek") {
      motion.targetEntityId = anchor?.id ?? null;
      motion.targetPosition = anchor ? { x: anchor.x, y: anchor.y } : null;
      return;
    }

    // BehaviorPreference pets get their targets from BehaviorSelectionSystem.
    // MotionTargetSystem must not assign random targets for them, otherwise
    // BehaviorSelectionSystem would never see an empty target to trigger on.
    if (components.getComponent(_id, "BehaviorPreference")) return;

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

  components.query(
    ["Transform", "WalkingState", "ContactState", "CanWalk", "MotionTarget", "NavigationState"],
    (id, [transform, , contact, canWalk, motion, navigation]) => {
      if (!contact.grounded) return;

      const target = navigation.avoidanceWaypoint ?? motion.targetPosition;
      if (!target) return;

      const dx = target.x - transform.position.x;
      if (Math.abs(dx) <= WALK_ARRIVAL_RADIUS) return;

      forces.push({ id, x: Math.sign(dx) * canWalk.speed, y: 0 });
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

  components.query(
    ["WalkingState", "ContactState", "CanJump", "JumpActionState"],
    (id, [, contact, jump, jumpAction]) => {
      if (jumpAction.phase === "landingCooldown") {
        jumpAction.cooldownMs = Math.max(0, jumpAction.cooldownMs - deltaMs);
        if (jumpAction.cooldownMs === 0) jumpAction.phase = "ready";
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
  components.query(
    ["Transform", "ClimbingState", "CanWallClimb", "MotionTarget", "ContactState"],
    (id, [transform, , canWallClimb, motion, contact]) => {
      if (!contact.climbableSurfaceId || !motion.targetPosition) return;

      const deltaY = motion.targetPosition.y - transform.position.y;
      if (Math.abs(deltaY) <= WALL_CLIMB_ARRIVAL_RADIUS) {
        physics.setVelocity(id, { x: 0, y: 0 });
        return;
      }
      physics.setVelocity(id, { x: 0, y: Math.sign(deltaY) * canWallClimb.speed });
    },
  );
}

export function runIntentSteeringSystem(
  components: ComponentStore,
  forceGroups: Force[][],
): void {
  const forces: Force[] = [];

  components.query(
    ["Transform", "FlyingState", "MovementProfile", "IntentState", "MotionTarget", "NavigationState"],
    (id, [transform, , movement, intent, motion, navigation]) => {
      const target = navigation.avoidanceWaypoint ?? motion.targetPosition;
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
          ? movement.seekSpeed
          : intent.intent === "active"
            ? movement.activeSpeed
            : movement.idleSpeed;

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
  components.query(["PhysicsBody", "FlyingState", "CanFly"], (id, [, , canFly]) => {
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
  climbIntent: { surfaceEntityId: string } | undefined,
): boolean {
  if (!contact.climbableSurfaceId || !contact.climbableSurfacePosition) return false;
  if (climbIntent && contact.climbableSurfaceId !== climbIntent.surfaceEntityId) return false;
  if (!motion.targetPosition) return true;
  return (
    Math.abs(motion.targetPosition.x - contact.climbableSurfacePosition.x) <= CLIMB_TARGET_X_TOLERANCE
  );
}

function switchLocomotion(
  id: string,
  mode: "walk" | "climb" | "fly",
  components: ComponentStore,
) {
  for (const tag of ACTIVE_LOCOMOTION_TAGS) {
    components.removeComponent(id, tag);
  }
  if (mode === "walk") components.setComponent(id, { type: "WalkingState" });
  if (mode === "climb") components.setComponent(id, { type: "ClimbingState" });
  if (mode === "fly") components.setComponent(id, { type: "FlyingState" });
}
