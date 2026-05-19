import type { TransformComponent } from "@/core/components/simulation-components";

type TransformEntity = {
  id: string;
  transform: TransformComponent;
};

type PhysicsTransformSnapshot = {
  bodies: Array<{
    id: string;
    x: number;
    y: number;
  }>;
};

type PhysicsSnapshotSource<TSnapshot extends PhysicsTransformSnapshot> = {
  snapshot(): TSnapshot;
};

export function runPhysicsTransformSyncSystem<TSnapshot extends PhysicsTransformSnapshot>(
  entities: TransformEntity[],
  physics: PhysicsSnapshotSource<TSnapshot>,
) {
  const physicsSnapshot = physics.snapshot();
  const transformsById = new Map(entities.map((entity) => [entity.id, entity.transform]));

  for (const body of physicsSnapshot.bodies) {
    const transform = transformsById.get(body.id);
    if (transform) {
      transform.position = { x: body.x, y: body.y };
    }
  }

  return physicsSnapshot;
}
