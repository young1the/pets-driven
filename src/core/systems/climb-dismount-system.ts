import type {
  ClimbDismountStateComponent,
  ClimbIntentStateComponent,
  ClimbingStateComponent,
  ContactStateComponent,
  CanJumpComponent,
  JumpActionStateComponent,
  MotionTargetComponent,
  CanWallClimbComponent,
  CanWalkComponent,
  SimulationComponent,
  SimulationComponentType,
} from "@/core/components/simulation-components";

const CLIMB_DISMOUNT_COOLDOWN_MS = 700;

type ClimbDismountEntity = {
  id: string;
  climbing?: ClimbingStateComponent | null;
  motion: MotionTargetComponent;
  contact: ContactStateComponent;
  walk: CanWalkComponent;
  wallClimb: CanWallClimbComponent;
  jump: CanJumpComponent;
  jumpAction: JumpActionStateComponent;
  climbDismount: ClimbDismountStateComponent;
  climbIntent?: ClimbIntentStateComponent | null;
};

type ClimbDismountStore = {
  setComponent(id: string, component: SimulationComponent): void;
  removeComponent(id: string, type: SimulationComponentType): void;
};

export function runClimbDismountSystem(
  entities: ClimbDismountEntity[],
  deltaMs: number,
  components?: ClimbDismountStore,
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
      !entity.climbing ||
      !entity.contact.climbableSurfaceId ||
      entity.climbIntent?.phase === "approaching" ||
      entity.motion.targetPosition
    ) {
      continue;
    }

    components?.removeComponent(entity.id, "ClimbingState");
    components?.setComponent(entity.id, { type: "WalkingState" });
    entity.jumpAction.phase = "falling";
    entity.jumpAction.cooldownMs = 0;
    entity.climbDismount.phase = "airborne";
    entity.climbDismount.cooldownMs = 0;
  }
}
