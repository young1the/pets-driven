import type {
  ComponentOf,
  Component,
  ComponentType,
} from "@/core/components";
import type { EntityId, Entity } from "./entity";
import { createEntity } from "./entity";

/**
 * Serialized input shape for fixtures, presets, and future JSON models.
 * The component store hydrates this array shape into type-owned component tables.
 */
export type EntityDeclaration = {
  id: EntityId;
  components: Component[];
};

export type ComponentStore = {
  entities(): Entity[];
  getEntity(id: EntityId): Entity | undefined;
  getComponent<TType extends ComponentType>(
    id: EntityId,
    type: TType,
  ): ComponentOf<TType> | undefined;
  components<TType extends ComponentType>(
    type: TType,
  ): ReadonlyMap<EntityId, ComponentOf<TType>>;
  setComponent(componentOwnerId: EntityId, component: Component): void;
  removeComponent(componentOwnerId: EntityId, type: ComponentType): void;

  /** Array form for one-off queries and snapshot builders. */
  query<TTypes extends ComponentType[]>(
    ...types: TTypes
  ): Array<{
    id: EntityId;
    components: {
      [Index in keyof TTypes]: ComponentOf<TTypes[Index]>;
    };
  }>;

  /**
   * Zero-allocation callback form. Iterates matching entities directly without
   * building intermediate arrays. Prefer this in hot system loops.
   */
  forEach<TTypes extends ComponentType[]>(
    types: [...TTypes],
    callback: (
      id: EntityId,
      components: { [K in keyof TTypes]: ComponentOf<TTypes[K]> },
    ) => void,
  ): void;
};

export function createComponentStore(declarations: EntityDeclaration[]): ComponentStore {
  const entitiesById = new Map<EntityId, Entity>();
  const componentTables = new Map<ComponentType, Map<EntityId, Component>>();

  for (const declaration of declarations) {
    const entity = createEntity(declaration.id);
    for (const component of declaration.components) {
      setComponentForEntity(entity.id, component);
    }
    entitiesById.set(entity.id, entity);
  }

  function getComponentTable<TType extends ComponentType>(
    type: TType,
  ): Map<EntityId, ComponentOf<TType>> {
    let table = componentTables.get(type);
    if (!table) {
      table = new Map<EntityId, Component>();
      componentTables.set(type, table);
    }

    return table as Map<EntityId, ComponentOf<TType>>;
  }

  function setComponentForEntity(id: EntityId, component: Component) {
    const table = getComponentTable(component.type) as Map<EntityId, Component>;
    table.set(id, component);
  }

  function queryArray<TTypes extends ComponentType[]>(types: TTypes): Array<{
    id: EntityId;
    components: { [Index in keyof TTypes]: ComponentOf<TTypes[Index]> };
  }> {
    if (types.length === 0) {
      return [...entitiesById.values()].map((entity) => ({
        id: entity.id,
        components: [] as unknown as { [Index in keyof TTypes]: ComponentOf<TTypes[Index]> },
      }));
    }

    const tables = types.map((t) => getComponentTable(t));
    const smallestTable = tables.reduce((a, b) => (b.size < a.size ? b : a));

    return [...smallestTable.keys()].flatMap((id) => {
      const comps = types.map((t) => getComponentTable(t).get(id));
      if (comps.some((c) => c === undefined)) {
        return [];
      }
      return [{
        id,
        components: comps as { [Index in keyof TTypes]: ComponentOf<TTypes[Index]> },
      }];
    });
  }

  function queryCallback(
    types: ComponentType[],
    callback: (id: EntityId, components: Component[]) => void,
  ): void {
    if (types.length === 0) {
      for (const entity of entitiesById.values()) {
        callback(entity.id, []);
      }
      return;
    }

    const tables = types.map((t) => getComponentTable(t));
    const smallestTable = tables.reduce((a, b) => (b.size < a.size ? b : a));

    for (const id of smallestTable.keys()) {
      const comps: Component[] = [];
      let allPresent = true;
      for (let i = 0; i < types.length; i++) {
        const comp = tables[i].get(id);
        if (comp === undefined) {
          allPresent = false;
          break;
        }
        comps.push(comp);
      }
      if (allPresent) {
        callback(id, comps);
      }
    }
  }

  return {
    entities() {
      return [...entitiesById.values()];
    },
    getEntity(id) {
      return entitiesById.get(id);
    },
    getComponent(id, type) {
      return getComponentTable(type).get(id);
    },
    components(type) {
      return getComponentTable(type);
    },
    setComponent(id, component) {
      const entity = entitiesById.get(id);
      if (!entity) {
        throw new Error(`Unknown entity: ${id}`);
      }
      setComponentForEntity(id, component);
    },
    removeComponent(id, type) {
      const entity = entitiesById.get(id);
      if (!entity) {
        throw new Error(`Unknown entity: ${id}`);
      }
      getComponentTable(type).delete(id);
    },
    query(...types) {
      return queryArray(types);
    },
    forEach(types, callback) {
      queryCallback(types, callback as (id: EntityId, components: Component[]) => void);
    },
  };
}
