export type EntityId = string;

/**
 * Runtime ECS storage. Entity declarations enter as component arrays, but the
 * simulation keeps components in a Map for direct lookup by component type.
 */
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
