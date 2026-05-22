import type {
  ContactStateComponent,
  LocomotionStateComponent,
  SimulationComponent,
  SimulationComponentType,
} from "@/core/components/simulation-components";

const ACTIVE_LOCOMOTION_TAGS = [
  "WalkingState",
  "ClimbingState",
  "FlyingState",
] as const satisfies SimulationComponentType[];

type LocomotionActiveStateEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  contact?: ContactStateComponent;
};

type LocomotionActiveStateStore = {
  setComponent(id: string, component: SimulationComponent): void;
  removeComponent(id: string, type: SimulationComponentType): void;
};

export function runLocomotionActiveStateSystem(
  entities: LocomotionActiveStateEntity[],
  components: LocomotionActiveStateStore,
) {
  for (const entity of entities) {
    syncLocomotionModeTag(entity, components);
    syncAirborneTag(entity, components);
  }
}

function syncLocomotionModeTag(
  entity: LocomotionActiveStateEntity,
  components: LocomotionActiveStateStore,
) {
  for (const tag of ACTIVE_LOCOMOTION_TAGS) {
    components.removeComponent(entity.id, tag);
  }

  if (entity.locomotion.baseMode === "walk") {
    components.setComponent(entity.id, { type: "WalkingState" });
  }

  if (entity.locomotion.baseMode === "climb") {
    components.setComponent(entity.id, { type: "ClimbingState" });
  }

  if (entity.locomotion.baseMode === "fly") {
    components.setComponent(entity.id, { type: "FlyingState" });
  }
}

function syncAirborneTag(
  entity: LocomotionActiveStateEntity,
  components: LocomotionActiveStateStore,
) {
  const isAirborne =
    entity.locomotion.baseMode === "walk" && entity.contact && !entity.contact.grounded;

  if (isAirborne) {
    components.setComponent(entity.id, { type: "AirborneState" });
    return;
  }

  components.removeComponent(entity.id, "AirborneState");
}
