import type {
  Component,
  ComponentOf,
  ComponentType,
} from "@pets-driven/pet-engine/core/components";
import type { Entity, EntityId } from "./entity";
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
  components<TType extends ComponentType>(type: TType): ReadonlyMap<EntityId, ComponentOf<TType>>;
  setComponent(componentOwnerId: EntityId, component: Component): void;
  removeComponent(componentOwnerId: EntityId, type: ComponentType): void;

  /**
   * Create a new entity mid-simulation and seed it with components. Throws if
   * the id already exists. Used for transient logical entities that have no
   * physics body (e.g. social interaction sessions), so no physics
   * registration happens here — that is done once at world creation.
   */
  spawn(id: EntityId, components: Component[]): void;

  /**
   * Remove an entity and every component it owns from all tables. No-ops when
   * the id is unknown so teardown stays idempotent.
   */
  destroy(id: EntityId): void;

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
   * Low-allocation callback form. Iterates matching entities directly without
   * building result arrays. The component tuple is reused between callbacks, so
   * read or destructure it inside the callback instead of retaining it.
   */
  forEach<TTypes extends ComponentType[]>(
    types: [...TTypes],
    callback: (id: EntityId, components: { [K in keyof TTypes]: ComponentOf<TTypes[K]> }) => void,
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

  function queryArray<TTypes extends ComponentType[]>(
    types: TTypes,
  ): Array<{
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
      return [
        {
          id,
          components: comps as { [Index in keyof TTypes]: ComponentOf<TTypes[Index]> },
        },
      ];
    });
  }

  function queryCallback(
    types: ComponentType[],
    callback: (id: EntityId, components: Component[]) => void,
  ): void {
    if (types.length === 0) {
      const components: Component[] = [];
      for (const entity of entitiesById.values()) {
        callback(entity.id, components);
      }
      return;
    }

    const tables: Array<Map<EntityId, Component>> = [];
    for (const type of types) {
      tables.push(getComponentTable(type) as Map<EntityId, Component>);
    }
    const smallestTable = tables.reduce((a, b) => (b.size < a.size ? b : a));
    const comps: Component[] = [];

    for (const id of smallestTable.keys()) {
      comps.length = 0;
      let allPresent = true;
      for (let i = 0; i < tables.length; i++) {
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
    spawn(id, components) {
      if (entitiesById.has(id)) {
        throw new Error(`Entity already exists: ${id}`);
      }
      const entity = createEntity(id);
      entitiesById.set(id, entity);
      for (const component of components) {
        setComponentForEntity(id, component);
      }
    },
    destroy(id) {
      if (!entitiesById.delete(id)) return;
      for (const table of componentTables.values()) {
        table.delete(id);
      }
    },
    query(...types) {
      return queryArray(types);
    },
    forEach(types, callback) {
      queryCallback(types, callback as (id: EntityId, components: Component[]) => void);
    },
  };
}
