import { describe, expect, it } from "vitest";
import {
  createComponentRegistry,
  type ComponentDefinition,
} from "@/core/ecs/component-registry";

type ExampleComponent = { type: "ExampleComponent"; weight: number };

const exampleDefinition: ComponentDefinition<ExampleComponent> = {
  type: "ExampleComponent",
  validate(value): value is ExampleComponent {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as ExampleComponent).type === "ExampleComponent" &&
      typeof (value as ExampleComponent).weight === "number"
    );
  },
};

describe("component registry", () => {
  it("registers and validates known component payloads", () => {
    const registry = createComponentRegistry([exampleDefinition]);

    expect(registry.validate({ type: "ExampleComponent", weight: 0.8 })).toBe(true);
    expect(registry.validate({ type: "ExampleComponent", weight: "high" })).toBe(false);
  });

  it("rejects unknown component types", () => {
    const registry = createComponentRegistry([exampleDefinition]);

    expect(registry.validate({ type: "Unknown" })).toBe(false);
  });
});
