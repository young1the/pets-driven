import type {
  ClimbingStateComponent,
  ContactStateComponent,
  FlyingStateComponent,
  SimulationComponent,
  SimulationComponentType,
  WalkingStateComponent,
} from "@/core/components/simulation-components";

type LocomotionActiveStateEntity = {
  id: string;
  contact?: ContactStateComponent;
  walking?: WalkingStateComponent | null;
  climbing?: ClimbingStateComponent | null;
  flying?: FlyingStateComponent | null;
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
    syncAirborneTag(entity, components);
  }
}

function syncAirborneTag(
  entity: LocomotionActiveStateEntity,
  components: LocomotionActiveStateStore,
) {
  const isAirborne =
    entity.walking && !entity.climbing && !entity.flying && entity.contact && !entity.contact.grounded;

  if (isAirborne) {
    components.setComponent(entity.id, { type: "AirborneState" });
    return;
  }

  components.removeComponent(entity.id, "AirborneState");
}
