import type {
  LocomotionStateComponent,
  MotionTargetComponent,
  Vector,
  WallClimbMovementComponent,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

const WALL_CLIMB_ARRIVAL_RADIUS = 16;

type WallClimbingEntity = {
  id: string;
  position: Vector;
  locomotion: LocomotionStateComponent;
  wallClimb: WallClimbMovementComponent;
  motion: MotionTargetComponent;
};

export function runWallClimbSystem(entities: WallClimbingEntity[]): Force[] {
  return entities.flatMap((entity) => {
    if (entity.locomotion.baseMode !== "climb" || !entity.motion.targetPosition) {
      return [];
    }

    const deltaY = entity.motion.targetPosition.y - entity.position.y;
    if (Math.abs(deltaY) <= WALL_CLIMB_ARRIVAL_RADIUS) {
      return [];
    }

    return [
      {
        id: entity.id,
        x: 0,
        y: Math.sign(deltaY) * entity.wallClimb.speed,
      },
    ];
  });
}
