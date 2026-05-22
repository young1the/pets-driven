import type {
  ClimbDismountStateComponent,
  ContactStateComponent,
  LocomotionStateComponent,
  WallClimbMovementComponent,
} from "@/core/components/simulation-components";

type LocomotionModeEntity = {
  locomotion: LocomotionStateComponent;
  contact: ContactStateComponent;
  wallClimb: WallClimbMovementComponent | null;
  climbDismount?: ClimbDismountStateComponent | null;
};

export function runLocomotionModeSystem(
  entities: LocomotionModeEntity[],
): void {
  for (const entity of entities) {
    if (entity.climbDismount && entity.climbDismount.cooldownMs > 0) {
      if (entity.locomotion.baseMode === "climb") {
        entity.locomotion.baseMode = "walk";
      }
      continue;
    }

    if (entity.wallClimb && entity.contact.climbableSurfaceId) {
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
