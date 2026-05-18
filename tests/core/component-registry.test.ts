import { describe, expect, it } from "vitest";
import {
  createComponentRegistry,
  type ComponentDefinition,
} from "@/core/ecs/component-registry";

type Curious = { type: "Curious"; weight: number };

const curiousDefinition: ComponentDefinition<Curious> = {
  type: "Curious",
  validate(value): value is Curious {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Curious).type === "Curious" &&
      typeof (value as Curious).weight === "number"
    );
  },
};

describe("component registry", () => {
  it("registers and validates known component payloads", () => {
    const registry = createComponentRegistry([curiousDefinition]);

    expect(registry.validate({ type: "Curious", weight: 0.8 })).toBe(true);
    expect(registry.validate({ type: "Curious", weight: "high" })).toBe(false);
  });

  it("rejects unknown component types", () => {
    const registry = createComponentRegistry([curiousDefinition]);

    expect(registry.validate({ type: "Unknown" })).toBe(false);
  });
});
