export type EntityId = string;

/**
 * Runtime entity identity. Components live in ComponentStore tables keyed by
 * component type, so entities stay as ids instead of owning component maps.
 */
export type Entity = {
  id: EntityId;
};

export function createEntity(id: EntityId): Entity {
  return {
    id,
  };
}
