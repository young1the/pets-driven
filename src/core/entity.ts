export type EntityId = string;

/**
 * Runtime entity identity. Components live in ComponentStore tables keyed by
 * component type, so entities stay as ids instead of owning component maps.
 */
export type RuntimeEntity = {
  id: EntityId;
};

export function createRuntimeEntity(id: EntityId): RuntimeEntity {
  return {
    id,
  };
}
