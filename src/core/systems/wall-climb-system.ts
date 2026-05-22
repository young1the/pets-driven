import type {
  CanWallClimbComponent,
  ClimbingStateComponent,
  ContactStateComponent,
  MotionTargetComponent,
  Vector,
} from "@/core/components/simulation-components";

const WALL_CLIMB_ARRIVAL_RADIUS = 16;

type WallClimbingEntity = {
  id: string;
  position: Vector;
  climbing: ClimbingStateComponent;
  canWallClimb: CanWallClimbComponent;
  contact: ContactStateComponent;
  motion: MotionTargetComponent;
};

type VelocityWritablePhysics = {
  setVelocity(id: string, velocity: { x?: number; y?: number }): void;
};

export function runWallClimbSystem(
  entities: WallClimbingEntity[],
  physics: VelocityWritablePhysics,
) {
  for (const entity of entities) {
    if (
      !entity.contact.climbableSurfaceId ||
      !entity.motion.targetPosition
    ) {
      continue;
    }

    const deltaY = entity.motion.targetPosition.y - entity.position.y;
    if (Math.abs(deltaY) <= WALL_CLIMB_ARRIVAL_RADIUS) {
      physics.setVelocity(entity.id, { x: 0, y: 0 });
      continue;
    }

    physics.setVelocity(entity.id, {
      x: 0,
      y: Math.sign(deltaY) * entity.canWallClimb.speed,
    });
  }
}
