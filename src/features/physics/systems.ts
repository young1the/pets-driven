import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { MatterPhysicsWorld } from "./matter-physics-world";
import type { Clock } from "@/shared/time/manual-clock";

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

  components.forEach(["Transform"], (_id, [transform]) => {
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

type ActiveCollisionSource = {
  activeCollisions(): Array<{ bodyAId: string; bodyBId: string }>;
};

export function runPetCollisionSyncSystem(
  components: ComponentStore,
  physics: ActiveCollisionSource,
  clock: Clock,
): void {
  const now = clock.now();
  const seenEntityIds = new Set<string>();

  for (const pair of physics.activeCollisions()) {
    syncPetCollision(components, pair.bodyAId, pair.bodyBId, now);
    syncPetCollision(components, pair.bodyBId, pair.bodyAId, now);
    seenEntityIds.add(pair.bodyAId);
    seenEntityIds.add(pair.bodyBId);
  }

  for (const [id] of components.components("PetCollision")) {
    if (!seenEntityIds.has(id)) {
      components.removeComponent(id, "PetCollision");
    }
  }
}

function syncPetCollision(
  components: ComponentStore,
  id: string,
  otherId: string,
  now: number,
): void {
  if (!components.getEntity(id) || !components.getEntity(otherId)) return;

  const otherTransform = components.getComponent(otherId, "Transform");
  if (!otherTransform) return;

  const existing = components.getComponent(id, "PetCollision");
  components.setComponent(id, {
    type: "PetCollision",
    otherEntityId: otherId,
    otherPosition: { ...otherTransform.position },
    startedAt: existing?.otherEntityId === otherId ? existing.startedAt : now,
    lastSeenAt: now,
  });
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

export const PetCollisionSyncSystem: SimulationSystem<WorldStepContext> = {
  name: "PetCollisionSyncSystem",
  dependsOn: ["PhysicsTransformSyncSystemPre"],
  reads: ["PhysicsWorld"],
  writes: ["PetCollision"],
  update(ctx) {
    runPetCollisionSyncSystem(ctx.components, ctx.physics, ctx.clock);
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
  dependsOn: ["WalkSystem", "CollisionEscapeSystem", "JumpSystem", "WallClimbSystem", "IntentSteeringSystem", "FlightSystem"],
  reads: ["PhysicsForce"],
  writes: ["PhysicsWorld"],
  update(ctx) {
    runPhysicsIntegrationSystem(ctx.physics, ctx.deltaMs, ctx.forceGroups);
  },
};
