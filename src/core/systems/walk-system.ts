import type {
  LocomotionStateComponent,
  MotionTargetComponent,
  NavigationStateComponent,
  Vector,
  WalkMovementComponent,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

const WALK_ARRIVAL_RADIUS = 16;

type WalkingEntity = {
  id: string;
  position: Vector;
  locomotion: LocomotionStateComponent;
  walk: WalkMovementComponent;
  motion: MotionTargetComponent;
  navigation?: NavigationStateComponent;
};

export function runWalkSystem(entities: WalkingEntity[]): Force[] {
  return entities.flatMap((entity) => {
    if (entity.locomotion.activeMode !== "walk") {
      return [];
    }

    const target = entity.navigation?.avoidanceWaypoint ?? entity.motion.targetPosition;
    if (!target) {
      return [];
    }

    const dx = target.x - entity.position.x;
    if (Math.abs(dx) <= WALK_ARRIVAL_RADIUS) {
      return [];
    }

    return [
      {
        id: entity.id,
        x: Math.sign(dx) * entity.walk.speed,
        y: 0,
      },
    ];
  });
}
