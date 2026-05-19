export type SimulationSystem<TContext> = {
  name: string;
  update(context: TContext): void;
};

export function runSimulationSystems<TContext>(
  systems: Array<SimulationSystem<TContext>>,
  context: TContext,
) {
  for (const system of systems) {
    system.update(context);
  }
}
