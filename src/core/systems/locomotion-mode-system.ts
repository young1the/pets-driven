import type {
  ClimbDismountStateComponent,
  ClimbIntentStateComponent,
  ContactStateComponent,
  MotionTargetComponent,
  CanWallClimbComponent,
  SimulationComponent,
  SimulationComponentType,
  WalkingStateComponent,
  ClimbingStateComponent,
  FlyingStateComponent,
} from "@/core/components/simulation-components";

const CLIMB_TARGET_X_TOLERANCE = 24;
const ACTIVE_LOCOMOTION_TAGS = [
  "WalkingState",
  "ClimbingState",
  "FlyingState",
] as const satisfies SimulationComponentType[];

type LocomotionModeEntity = {
  id: string;
  contact: ContactStateComponent;
  motion?: MotionTargetComponent | null;
  climbIntent?: ClimbIntentStateComponent | null;
  wallClimb: CanWallClimbComponent | null;
  climbDismount?: ClimbDismountStateComponent | null;
  walking?: WalkingStateComponent | null;
  climbing?: ClimbingStateComponent | null;
  flying?: FlyingStateComponent | null;
};

type LocomotionModeStore = {
  setComponent(id: string, component: SimulationComponent): void;
  removeComponent(id: string, type: SimulationComponentType): void;
};

export function runLocomotionModeSystem(
  entities: LocomotionModeEntity[],
  components: LocomotionModeStore,
): void {
  for (const entity of entities) {
    if (entity.climbDismount && entity.climbDismount.phase !== "ready") {
      if (entity.climbing) {
        switchLocomotion(entity.id, "walk", components);
      }
      continue;
    }

    if (entity.wallClimb && canEnterClimb(entity)) {
      switchLocomotion(entity.id, "climb", components);
    } else if (
      entity.wallClimb &&
      entity.climbing &&
      !entity.contact.climbableSurfaceId
    ) {
      switchLocomotion(entity.id, "walk", components);
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

function switchLocomotion(
  id: string,
  mode: "walk" | "climb" | "fly",
  components: LocomotionModeStore,
) {
  for (const tag of ACTIVE_LOCOMOTION_TAGS) {
    components.removeComponent(id, tag);
  }

  if (mode === "walk") {
    components.setComponent(id, { type: "WalkingState" });
  }

  if (mode === "climb") {
    components.setComponent(id, { type: "ClimbingState" });
  }

  if (mode === "fly") {
    components.setComponent(id, { type: "FlyingState" });
  }
}
