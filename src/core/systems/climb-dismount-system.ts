import type {
  ClimbDismountStateComponent,
  ClimbIntentStateComponent,
  ContactStateComponent,
  CanJumpComponent,
  JumpActionStateComponent,
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
  jumpAction: JumpActionStateComponent;
  climbDismount: ClimbDismountStateComponent;
  climbIntent?: ClimbIntentStateComponent | null;
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
      entity.climbIntent?.phase === "approaching" ||
      entity.motion.targetPosition
    ) {
      continue;
    }

    entity.locomotion.baseMode = "walk";
    entity.jumpAction.phase = "falling";
    entity.jumpAction.cooldownMs = 0;
    entity.climbDismount.phase = "airborne";
    entity.climbDismount.cooldownMs = 0;
  }
}
