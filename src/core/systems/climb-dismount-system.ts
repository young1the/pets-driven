import type {
  ClimbDismountStateComponent,
  ContactStateComponent,
  JumpMovementComponent,
  JumpStateComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  WallClimbMovementComponent,
  WalkMovementComponent,
} from "@/core/components/simulation-components";

const CLIMB_DISMOUNT_COOLDOWN_MS = 700;

type ClimbDismountEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  motion: MotionTargetComponent;
  contact: ContactStateComponent;
  walk: WalkMovementComponent;
  wallClimb: WallClimbMovementComponent;
  jump: JumpMovementComponent;
  jumpState: JumpStateComponent;
  climbDismount: ClimbDismountStateComponent;
};

export function runClimbDismountSystem(
  entities: ClimbDismountEntity[],
  deltaMs: number,
) {
  for (const entity of entities) {
    entity.climbDismount.cooldownMs = Math.max(
      0,
      entity.climbDismount.cooldownMs - deltaMs,
    );

    if (
      entity.climbDismount.cooldownMs > 0 ||
      entity.locomotion.baseMode !== "climb" ||
      !entity.contact.climbableSurfaceId ||
      entity.motion.targetPosition
    ) {
      continue;
    }

    entity.locomotion.baseMode = "walk";
    entity.jumpState.pending = true;
    entity.climbDismount.cooldownMs = CLIMB_DISMOUNT_COOLDOWN_MS;
  }
}
