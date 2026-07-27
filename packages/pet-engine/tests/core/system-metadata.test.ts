import { STEP_SYSTEMS } from "@pets-driven/pet-engine/core/phases";
import { describe, expect, it } from "vitest";

/**
 * `reads`/`writes` are checked by the compiler — a name outside `ComponentType`
 * or `SystemResource` fails `tsc`. `dependsOn` is a plain string list that only
 * has meaning against the registered pipeline, so it is checked here instead.
 */

const systemOrder = new Map(STEP_SYSTEMS.map((system, index) => [system.name, index]));

describe("system metadata", () => {
  it("registers each system name exactly once", () => {
    const names = STEP_SYSTEMS.map((system) => system.name);

    expect(names).toHaveLength(new Set(names).size);
  });

  it("points every dependsOn edge at a registered system", () => {
    const unregistered = STEP_SYSTEMS.flatMap((system) =>
      (system.dependsOn ?? [])
        .filter((dependency) => !systemOrder.has(dependency))
        .map((dependency) => `${system.name} -> ${dependency}`),
    );

    expect(unregistered).toEqual([]);
  });

  it("keeps every dependsOn target earlier in the pipeline than its dependent", () => {
    // STEP_SYSTEMS is dispatched in array order, so a dependency that runs
    // later is a declaration the tick can never satisfy.
    const outOfOrder = STEP_SYSTEMS.flatMap((system, index) =>
      (system.dependsOn ?? [])
        .filter((dependency) => {
          const dependencyIndex = systemOrder.get(dependency);
          return dependencyIndex !== undefined && dependencyIndex >= index;
        })
        .map((dependency) => `${system.name} -> ${dependency}`),
    );

    expect(outOfOrder).toEqual([]);
  });
});
