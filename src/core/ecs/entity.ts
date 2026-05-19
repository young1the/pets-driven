export type EntityId = string;

export type RuntimeEntity = {
  id: EntityId;
  components: Map<string, unknown>;
};

export function createRuntimeEntity(id: EntityId): RuntimeEntity {
  return {
    id,
    components: new Map(),
  };
}

export function addComponent<T extends { type: string }>(entity: RuntimeEntity, component: T) {
  entity.components.set(component.type, component);
}

export function getComponent<T>(entity: RuntimeEntity, type: string): T | undefined {
  return entity.components.get(type) as T | undefined;
}
