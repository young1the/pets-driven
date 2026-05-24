import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { MatterPhysicsWorld } from "./matter-physics-world";

export type Force = {
  id: string;
  x: number;
  y: number;
};

type PhysicsTransformSnapshot = {
  bodies: Array<{ id: string; x: number; y: number }>;
};

type PhysicsSnapshotSource<TSnapshot extends PhysicsTransformSnapshot> = {
  snapshot(): TSnapshot;
};

export function runPhysicsTransformSyncSystem<TSnapshot extends PhysicsTransformSnapshot>(
  components: ComponentStore,
  physics: PhysicsSnapshotSource<TSnapshot>,
): TSnapshot {
  const snapshot = physics.snapshot();

  components.query(["Transform"], (_id, [transform]) => {
    // match is done by id below
    void transform;
  });

  for (const body of snapshot.bodies) {
    const transform = components.getComponent(body.id, "Transform");
    if (transform) {
      transform.position = { x: body.x, y: body.y };
    }
  }

  return snapshot;
}

export function runPhysicsIntegrationSystem(
  physics: MatterPhysicsWorld,
  deltaMs: number,
  forceGroups: Force[][],
): void {
  const forcesById = new Map<string, { x: number; y: number }>();

  for (const force of forceGroups.flat()) {
    const previous = forcesById.get(force.id) ?? { x: 0, y: 0 };
    forcesById.set(force.id, {
      x: previous.x + force.x,
      y: previous.y + force.y,
    });
  }

  for (const [id, force] of forcesById) {
    physics.applyForce(id, force);
  }

  physics.step(deltaMs);
}

// ── System descriptors ─────────────────────────────────────────────────────

export const PhysicsTransformSyncSystemPre: SimulationSystem<WorldStepContext> = {
  name: "PhysicsTransformSyncSystemPre",
  reads: ["PhysicsBody"],
  writes: ["Transform"],
  update(ctx) {
    runPhysicsTransformSyncSystem(ctx.components, ctx.physics);
  },
};

export const PhysicsTransformSyncSystemPost: SimulationSystem<WorldStepContext> = {
  name: "PhysicsTransformSyncSystemPost",
  dependsOn: ["PhysicsIntegrationSystem"],
  reads: ["PhysicsWorld"],
  writes: ["Transform"],
  update(ctx) {
    runPhysicsTransformSyncSystem(ctx.components, ctx.physics);
  },
};

export const PhysicsIntegrationSystem: SimulationSystem<WorldStepContext> = {
  name: "PhysicsIntegrationSystem",
  dependsOn: ["WalkSystem", "JumpSystem", "WallClimbSystem", "IntentSteeringSystem", "FlightSystem"],
  reads: ["PhysicsForce"],
  writes: ["PhysicsWorld"],
  update(ctx) {
    runPhysicsIntegrationSystem(ctx.physics, ctx.deltaMs, ctx.forceGroups);
  },
};
