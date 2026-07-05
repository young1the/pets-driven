import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import type { MatterPhysicsWorld } from "./matter-physics-world";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

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

  for (const group of forceGroups) {
    for (const force of group) {
      const previous = forcesById.get(force.id) ?? { x: 0, y: 0 };
      forcesById.set(force.id, {
        x: previous.x + force.x,
        y: previous.y + force.y,
      });
    }
  }

  for (const [id, force] of forcesById) {
    physics.applyForce(id, force);
  }

  physics.step(deltaMs);
}

/**
 * Pets are physical ghosts to each other (they only collide with surfaces —
 * see matter-physics-world collision filters), so "touching another pet" is
 * a *perceived* fact, not a physics constraint. This system derives it
 * geometrically from body AABBs each tick: stable while bodies overlap, no
 * solver-separation blinking, and it feeds the same PetCollision component
 * the behavior layer (startle, bump-to-greet, pair cooldown) already reads.
 */
export function runPetCollisionSyncSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  const now = clock.now();

  type PetBody = { id: string; x: number; y: number; halfW: number; halfH: number };
  const pets: PetBody[] = [];
  components.forEach(
    ["Transform", "PhysicsBody", "PetIdentity"],
    (id, [transform, body]) => {
      pets.push({
        id,
        x: transform.position.x,
        y: transform.position.y,
        halfW: body.width / 2,
        halfH: body.height / 2,
      });
    },
  );

  for (const pet of pets) {
    let nearest: PetBody | null = null;
    let nearestDistance = Infinity;
    for (const other of pets) {
      if (other.id === pet.id) continue;
      const overlapping =
        Math.abs(other.x - pet.x) < pet.halfW + other.halfW &&
        Math.abs(other.y - pet.y) < pet.halfH + other.halfH;
      if (!overlapping) continue;
      const distance = Math.hypot(other.x - pet.x, other.y - pet.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = other;
      }
    }

    if (!nearest) {
      components.removeComponent(pet.id, "PetCollision");
      continue;
    }

    const existing = components.getComponent(pet.id, "PetCollision");
    components.setComponent(pet.id, {
      type: "PetCollision",
      otherEntityId: nearest.id,
      otherPosition: { x: nearest.x, y: nearest.y },
      startedAt:
        existing?.otherEntityId === nearest.id ? existing.startedAt : now,
      lastSeenAt: now,
    });
  }
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
  reads: ["Transform", "PhysicsBody", "PetIdentity"],
  writes: ["PetCollision"],
  update(ctx) {
    runPetCollisionSyncSystem(ctx.components, ctx.clock);
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
