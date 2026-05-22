import type {
  CanWallClimbComponent,
  ClimbIntentStateComponent,
  ClimbingStateComponent,
  MotionTargetComponent,
  TransformComponent,
  Vector,
} from "@/core/components/simulation-components";

type ClimbApproachEntity = {
  id: string;
  climbing?: ClimbingStateComponent | null;
  transform: TransformComponent;
  motion: MotionTargetComponent;
  climbIntent: ClimbIntentStateComponent;
  canWallClimb: CanWallClimbComponent;
};

type ClimbableSurface = {
  id: string;
  position: Vector;
};

export function runClimbApproachSystem(
  entities: ClimbApproachEntity[],
  surfaces: ClimbableSurface[],
) {
  for (const entity of entities) {
    if (entity.climbing) {
      continue;
    }

    if (entity.climbIntent.phase !== "approaching") {
      continue;
    }

    const surface = surfaces.find(
      (candidate) => candidate.id === entity.climbIntent.surfaceEntityId,
    );
    if (!surface) {
      continue;
    }

    entity.motion.targetEntityId = null;
    entity.motion.targetPosition = {
      x: surface.position.x,
      y: entity.transform.position.y,
    };
  }
}
