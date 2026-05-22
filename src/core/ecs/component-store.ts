import type {
  ComponentOf,
  SimulationComponent,
  SimulationComponentType,
} from "@/core/components/simulation-components";
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
      if (types.length === 0) {
        return [...entitiesById.values()].map((entity) => ({
          id: entity.id,
          components: [] as unknown as {
            [Index in keyof typeof types]: ComponentOf<(typeof types)[Index]>;
          },
        }));
      }

      const smallestTable = types
        .map((type) => getComponentTable(type))
        .reduce((smallest, table) => (table.size < smallest.size ? table : smallest));

      return [...smallestTable.keys()].flatMap((id) => {
        const components = types.map((type) => getComponentTable(type).get(id));
        if (components.some((component) => component === undefined)) {
          return [];
        }

        return [
          {
            id,
            components: components as {
              [Index in keyof typeof types]: ComponentOf<(typeof types)[Index]>;
            },
          },
        ];
      });
    },
  };
}
