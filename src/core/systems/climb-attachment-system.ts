import type {
  ClimbIntentStateComponent,
  ClimbingStateComponent,
  ContactStateComponent,
  MotionTargetComponent,
  TransformComponent,
} from "@/core/components/simulation-components";

type ClimbAttachmentEntity = {
  id: string;
  climbing: ClimbingStateComponent;
  contact: ContactStateComponent;
  transform: TransformComponent;
  motion: MotionTargetComponent;
  climbIntent?: ClimbIntentStateComponent | null;
};

type VelocityWritablePhysics = {
  setPosition(id: string, position: { x?: number; y?: number }): void;
  setVelocity(id: string, velocity: { x?: number; y?: number }): void;
};

export function runClimbAttachmentSystem(
  entities: ClimbAttachmentEntity[],
  physics: VelocityWritablePhysics,
) {
  for (const entity of entities) {
    if (entity.contact.climbableSurfaceId && entity.contact.climbableSurfacePosition) {
      const surfaceX = entity.contact.climbableSurfacePosition.x;
      entity.transform.position.x = surfaceX;
      physics.setPosition(entity.id, {
        x: surfaceX,
      });
      physics.setVelocity(entity.id, { x: 0 });

      if (
        entity.climbIntent &&
        entity.climbIntent.surfaceEntityId === entity.contact.climbableSurfaceId
      ) {
        entity.climbIntent.phase = "attached";
        entity.motion.targetEntityId = null;
        entity.motion.targetPosition = {
          x: surfaceX,
          y: entity.climbIntent.targetY,
        };
      }
    }
  }
}
