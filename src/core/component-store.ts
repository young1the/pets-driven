import type {
  ComponentOf,
  SimulationComponent,
  SimulationComponentType,
} from "@/core/components";
import type { EntityId, RuntimeEntity } from "./entity";
import { createRuntimeEntity } from "./entity";

/**
 * Serialized input shape for fixtures, presets, and future JSON models.
 * The component store hydrates this array shape into type-owned component tables.
 */
export type EntityDeclaration = {
  id: EntityId;
  components: SimulationComponent[];
};

export type ComponentStore = {
  entities(): RuntimeEntity[];
  getEntity(id: EntityId): RuntimeEntity | undefined;
  getComponent<TType extends SimulationComponentType>(
    id: EntityId,
    type: TType,
  ): ComponentOf<TType> | undefined;
  components<TType extends SimulationComponentType>(
    type: TType,
  ): ReadonlyMap<EntityId, ComponentOf<TType>>;
  setComponent(componentOwnerId: EntityId, component: SimulationComponent): void;
  removeComponent(componentOwnerId: EntityId, type: SimulationComponentType): void;

  /**
   * Zero-allocation callback form. Iterates matching entities directly without
   * building intermediate arrays or named-prop objects. Prefer this in hot
   * system loops.
   */
  query<TTypes extends SimulationComponentType[]>(
    types: [...TTypes],
    callback: (
      id: EntityId,
      components: { [K in keyof TTypes]: ComponentOf<TTypes[K]> },
    ) => void,
  ): void;

  /** Array form for one-off queries and snapshot builders. */
  query<TTypes extends SimulationComponentType[]>(
    ...types: TTypes
  ): Array<{
    id: EntityId;
    components: {
      [Index in keyof TTypes]: ComponentOf<TTypes[Index]>;
    };
  }>;
};

export function createComponentStore(declarations: EntityDeclaration[]): ComponentStore {
  const entitiesById = new Map<EntityId, RuntimeEntity>();
  const componentTables = new Map<SimulationComponentType, Map<EntityId, SimulationComponent>>();

  for (const declaration of declarations) {
    const entity = createRuntimeEntity(declaration.id);
    for (const component of declaration.components) {
      setComponentForEntity(entity.id, component);
    }
    entitiesById.set(entity.id, entity);
  }

  function getComponentTable<TType extends SimulationComponentType>(
    type: TType,
  ): Map<EntityId, ComponentOf<TType>> {
    let table = componentTables.get(type);
    if (!table) {
      table = new Map<EntityId, SimulationComponent>();
      componentTables.set(type, table);
    }

    return table as Map<EntityId, ComponentOf<TType>>;
  }

  function setComponentForEntity(id: EntityId, component: SimulationComponent) {
    const table = getComponentTable(component.type) as Map<EntityId, SimulationComponent>;
    table.set(id, component);
  }

  function queryArray(types: SimulationComponentType[]) {
    if (types.length === 0) {
      return [...entitiesById.values()].map((entity) => ({
        id: entity.id,
        components: [] as unknown as never[],
      }));
    }

    const tables = types.map((t) => getComponentTable(t));
    const smallestTable = tables.reduce((a, b) => (b.size < a.size ? b : a));

    return [...smallestTable.keys()].flatMap((id) => {
      const comps = types.map((t) => getComponentTable(t).get(id));
      if (comps.some((c) => c === undefined)) {
        return [];
      }
      return [{ id, components: comps as never[] }];
    });
  }

  function queryCallback(
    types: SimulationComponentType[],
    callback: (id: EntityId, components: SimulationComponent[]) => void,
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
      const comps: SimulationComponent[] = [];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query(...args: any[]): any {
      if (Array.isArray(args[0]) && typeof args[1] === "function") {
        queryCallback(args[0] as SimulationComponentType[], args[1]);
        return undefined;
      }
      return queryArray(args as SimulationComponentType[]);
    },
  };
}
