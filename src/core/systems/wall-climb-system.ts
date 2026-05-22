import type {
  CanWallClimbComponent,
  ClimbingStateComponent,
  ContactStateComponent,
  MotionTargetComponent,
  Vector,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

const WALL_CLIMB_ARRIVAL_RADIUS = 16;
const WALL_CLIMB_SURFACE_GRIP_DEAD_ZONE = 2;
const WALL_CLIMB_SURFACE_GRIP_STIFFNESS = 0.0002;

type WallClimbingEntity = {
  id: string;
  position: Vector;
  climbing: ClimbingStateComponent;
  canWallClimb: CanWallClimbComponent;
  contact: ContactStateComponent;
  motion: MotionTargetComponent;
};

export function runWallClimbSystem(entities: WallClimbingEntity[]): Force[] {
  return entities.flatMap((entity) => {
    if (
      !entity.contact.climbableSurfaceId ||
      !entity.motion.targetPosition
    ) {
      return [];
    }

    const deltaY = entity.motion.targetPosition.y - entity.position.y;
    if (Math.abs(deltaY) <= WALL_CLIMB_ARRIVAL_RADIUS) {
      return [];
    }

    const deltaX =
      (entity.contact.climbableSurfacePosition?.x ?? entity.position.x) -
      entity.position.x;
    const surfaceGripForce =
      Math.abs(deltaX) <= WALL_CLIMB_SURFACE_GRIP_DEAD_ZONE
        ? 0
        : clamp(
            deltaX * WALL_CLIMB_SURFACE_GRIP_STIFFNESS,
            -entity.canWallClimb.speed,
            entity.canWallClimb.speed,
          );

    return [
      {
        id: entity.id,
        x: surfaceGripForce,
        y: Math.sign(deltaY) * entity.canWallClimb.speed,
      },
    ];
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
