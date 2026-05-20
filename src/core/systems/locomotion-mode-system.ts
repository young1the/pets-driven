import type {
  ContactStateComponent,
  LocomotionStateComponent,
  WallClimbMovementComponent,
} from "@/core/components/simulation-components";

type LocomotionModeEntity = {
  locomotion: LocomotionStateComponent;
  contact: ContactStateComponent;
  wallClimb: WallClimbMovementComponent | null;
};

export function runLocomotionModeSystem(
  entities: LocomotionModeEntity[],
): void {
  for (const entity of entities) {
    if (entity.wallClimb && entity.contact.climbableSurfaceId) {
      entity.locomotion.baseMode = "climb";
    }
  }
}
