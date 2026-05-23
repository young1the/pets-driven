import type { ComponentStore } from "@/core/component-store";
import type { Force } from "@/features/physics/systems";

const WALK_ARRIVAL_RADIUS = 16;

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
