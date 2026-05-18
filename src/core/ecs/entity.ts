export type EntityId = string;

export type Entity = {
  id: EntityId;
  components: Map<string, unknown>;
};

export function createEntity(id: EntityId): Entity {
  return {
    id,
    components: new Map(),
  };
}

export function addComponent<T extends { type: string }>(entity: Entity, component: T) {
  entity.components.set(component.type, component);
}

export function getComponent<T>(entity: Entity, type: string): T | undefined {
  return entity.components.get(type) as T | undefined;
}
