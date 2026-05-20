import type {
  ContactStateComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  Vector,
  WallClimbMovementComponent,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

const WALL_CLIMB_ARRIVAL_RADIUS = 16;
const WALL_CLIMB_SURFACE_GRIP_DEAD_ZONE = 2;
const WALL_CLIMB_SURFACE_GRIP_MULTIPLIER = 2;

type WallClimbingEntity = {
  id: string;
  position: Vector;
  locomotion: LocomotionStateComponent;
  wallClimb: WallClimbMovementComponent;
  contact: ContactStateComponent;
  motion: MotionTargetComponent;
};

export function runWallClimbSystem(entities: WallClimbingEntity[]): Force[] {
  return entities.flatMap((entity) => {
    if (
      entity.locomotion.baseMode !== "climb" ||
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
        : Math.sign(deltaX) *
          entity.wallClimb.speed *
          WALL_CLIMB_SURFACE_GRIP_MULTIPLIER;

    return [
      {
        id: entity.id,
        x: surfaceGripForce,
        y: Math.sign(deltaY) * entity.wallClimb.speed,
      },
    ];
  });
}
