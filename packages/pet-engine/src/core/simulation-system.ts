import type { ComponentType } from "@pets-driven/pet-engine/core/components";

/**
 * Non-component state a system touches. `reads`/`writes` name components by
 * default, but a handful of systems act on the Matter physics resource or the
 * world event queue instead — state that lives on `WorldStepContext`, not in
 * the component store. Declaring that vocabulary here keeps those entries
 * distinguishable from component names and still lets the compiler reject a
 * misspelling on either side.
 */
export type SystemResource =
  | "PhysicsWorld"
  | "PhysicsForce"
  | "PhysicsPosition"
  | "PhysicsVelocity"
  | "PhysicsGravityScale"
  | "WorldEventQueue"
  | "QuietMode";

/** What a system declares it touches: a component type or a context resource. */
export type SystemAccess = ComponentType | SystemResource;

export type SimulationSystem<TContext> = {
  name: string;
  dependsOn?: string[];
  reads?: SystemAccess[];
  writes?: SystemAccess[];
  update(context: TContext): void;
};

export type SimulationSystemDescription = {
  name: string;
  dependsOn?: string[];
  reads?: SystemAccess[];
  writes?: SystemAccess[];
};

export function runSimulationSystems<TContext>(
  systems: Array<SimulationSystem<TContext>>,
  context: TContext,
) {
  for (const system of systems) {
    system.update(context);
  }
}

export function describeSimulationSystems<TContext>(
  systems: Array<SimulationSystem<TContext>>,
): SimulationSystemDescription[] {
  return systems.map((system) => ({
    name: system.name,
    ...(system.dependsOn ? { dependsOn: system.dependsOn } : {}),
    ...(system.reads ? { reads: system.reads } : {}),
    ...(system.writes ? { writes: system.writes } : {}),
  }));
}
