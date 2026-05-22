import type {
  ClimbDismountStateComponent,
  ContactStateComponent,
  CanJumpComponent,
  JumpStateComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  CanWallClimbComponent,
  CanWalkComponent,
} from "@/core/components/simulation-components";

const CLIMB_DISMOUNT_COOLDOWN_MS = 700;

type ClimbDismountEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  motion: MotionTargetComponent;
  contact: ContactStateComponent;
  walk: CanWalkComponent;
  wallClimb: CanWallClimbComponent;
  jump: CanJumpComponent;
  jumpState: JumpStateComponent;
  climbDismount: ClimbDismountStateComponent;
};

export function runClimbDismountSystem(
  entities: ClimbDismountEntity[],
  deltaMs: number,
) {
  for (const entity of entities) {
    if (entity.climbDismount.phase === "airborne") {
      if (entity.contact.grounded) {
        entity.climbDismount.phase = "coolingDown";
        entity.climbDismount.cooldownMs = CLIMB_DISMOUNT_COOLDOWN_MS;
      }
      continue;
    }

    if (entity.climbDismount.phase === "coolingDown") {
      entity.climbDismount.cooldownMs = Math.max(
        0,
        entity.climbDismount.cooldownMs - deltaMs,
      );

      if (entity.climbDismount.cooldownMs === 0) {
        entity.climbDismount.phase = "ready";
      }
      continue;
    }

    if (
      entity.locomotion.baseMode !== "climb" ||
      !entity.contact.climbableSurfaceId ||
      entity.motion.targetPosition
    ) {
      continue;
    }

    entity.locomotion.baseMode = "walk";
    entity.jumpState.pending = false;
    entity.climbDismount.phase = "airborne";
    entity.climbDismount.cooldownMs = 0;
  }
}
