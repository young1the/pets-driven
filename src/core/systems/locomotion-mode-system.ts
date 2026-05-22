import type {
  ClimbDismountStateComponent,
  ClimbIntentStateComponent,
  ContactStateComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  CanWallClimbComponent,
} from "@/core/components/simulation-components";

const CLIMB_TARGET_X_TOLERANCE = 24;

type LocomotionModeEntity = {
  locomotion: LocomotionStateComponent;
  contact: ContactStateComponent;
  motion?: MotionTargetComponent | null;
  climbIntent?: ClimbIntentStateComponent | null;
  wallClimb: CanWallClimbComponent | null;
  climbDismount?: ClimbDismountStateComponent | null;
};

export function runLocomotionModeSystem(
  entities: LocomotionModeEntity[],
): void {
  for (const entity of entities) {
    if (entity.climbDismount && entity.climbDismount.phase !== "ready") {
      if (entity.locomotion.baseMode === "climb") {
        entity.locomotion.baseMode = "walk";
      }
      continue;
    }

    if (entity.wallClimb && canEnterClimb(entity)) {
      entity.locomotion.baseMode = "climb";
    } else if (
      entity.wallClimb &&
      entity.locomotion.baseMode === "climb" &&
      !entity.contact.climbableSurfaceId
    ) {
      entity.locomotion.baseMode = "walk";
    }
  }
}

function canEnterClimb(entity: LocomotionModeEntity) {
  if (!entity.contact.climbableSurfaceId || !entity.contact.climbableSurfacePosition) {
    return false;
  }

  if (
    entity.climbIntent &&
    entity.contact.climbableSurfaceId !== entity.climbIntent.surfaceEntityId
  ) {
    return false;
  }

  if (!entity.motion?.targetPosition) {
    return true;
  }

  return (
    Math.abs(
      entity.motion.targetPosition.x - entity.contact.climbableSurfacePosition.x,
    ) <= CLIMB_TARGET_X_TOLERANCE
  );
}
