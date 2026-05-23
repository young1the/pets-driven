export type ComponentDefinition<T extends { type: string }> = {
  type: T["type"];
  validate(value: unknown): value is T;
};

export type ComponentRegistry = {
  validate(value: unknown): boolean;
  has(type: string): boolean;
};

export function createComponentRegistry(
  definitions: ComponentDefinition<{ type: string }>[],
): ComponentRegistry {
  const definitionsByType = new Map(definitions.map((definition) => [definition.type, definition]));

  return {
    has(type) {
      return definitionsByType.has(type);
    },
    validate(value) {
      if (typeof value !== "object" || value === null || !("type" in value)) {
        return false;
      }

      const type = (value as { type: string }).type;
      const definition = definitionsByType.get(type);
      return definition ? definition.validate(value) : false;
    },
  };
}
