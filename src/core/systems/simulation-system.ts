export type SimulationSystem<TContext> = {
  name: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  update(context: TContext): void;
};

export type SimulationSystemDescription = {
  name: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
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
