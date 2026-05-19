import type {
  ComponentOf,
  SimulationComponent,
  SimulationComponentType,
} from "@/core/components/simulation-components";
import type { EntityId, RuntimeEntity } from "./entity";
import { addComponent, createRuntimeEntity, getComponent as getEntityComponent } from "./entity";

/**
 * Serialized input shape for fixtures, presets, and future JSON models.
 * The component store hydrates this array shape into RuntimeEntity maps.
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
  setComponent(componentOwnerId: EntityId, component: SimulationComponent): void;
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

  for (const declaration of declarations) {
    const entity = createRuntimeEntity(declaration.id);
    for (const component of declaration.components) {
      addComponent(entity, component);
    }
    entitiesById.set(entity.id, entity);
  }

  return {
    entities() {
      return [...entitiesById.values()];
    },
    getEntity(id) {
      return entitiesById.get(id);
    },
    getComponent(id, type) {
      const entity = entitiesById.get(id);
      return entity ? getEntityComponent<ComponentOf<typeof type>>(entity, type) : undefined;
    },
    setComponent(id, component) {
      const entity = entitiesById.get(id);
      if (!entity) {
        throw new Error(`Unknown entity: ${id}`);
      }
      addComponent(entity, component);
    },
    query(...types) {
      return [...entitiesById.values()].flatMap((entity) => {
        const components = types.map((type) => getEntityComponent(entity, type));
        if (components.some((component) => component === undefined)) {
          return [];
        }

        return [
          {
            id: entity.id,
            components: components as {
              [Index in keyof typeof types]: ComponentOf<(typeof types)[Index]>;
            },
          },
        ];
      });
    },
  };
}
