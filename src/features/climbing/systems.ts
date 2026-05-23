import type { ComponentStore } from "@/core/component-store";
import type { MatterPhysicsWorld } from "@/features/physics/matter-physics-world";
import type { Vector } from "@/features/physics/components";

const CLIMB_DISMOUNT_COOLDOWN_MS = 700;
const WALL_CLIMB_ARRIVAL_RADIUS = 16;

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
