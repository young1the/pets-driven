import type { ComponentStore } from "@/core/component-store";
import type { MatterPhysicsWorld } from "@/features/physics/matter-physics-world";
import type { Force } from "@/features/physics/systems";

const MOTION_ARRIVAL_RADIUS = 16;
const MOTION_SLOW_RADIUS = 96;

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
