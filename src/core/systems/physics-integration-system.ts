export type Force = {
  id: string;
  x: number;
  y: number;
};

type ForceDrivenPhysics = {
  applyForce(id: string, force: { x: number; y: number }): void;
  step(deltaMs: number): void;
};

export function runPhysicsIntegrationSystem(input: {
  physics: ForceDrivenPhysics;
  deltaMs: number;
  forceGroups: Force[][];
}) {
  const forcesById = new Map<string, { x: number; y: number }>();

  for (const force of input.forceGroups.flat()) {
    const previous = forcesById.get(force.id) ?? { x: 0, y: 0 };
    forcesById.set(force.id, {
      x: previous.x + force.x,
      y: previous.y + force.y,
    });
  }

  for (const [id, force] of forcesById) {
    input.physics.applyForce(id, force);
  }

  input.physics.step(input.deltaMs);
}
