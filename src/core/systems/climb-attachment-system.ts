import type {
  ClimbingStateComponent,
  ContactStateComponent,
  TransformComponent,
} from "@/core/components/simulation-components";

type ClimbAttachmentEntity = {
  id: string;
  climbing: ClimbingStateComponent;
  contact: ContactStateComponent;
  transform: TransformComponent;
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
      entity.transform.position.x = entity.contact.climbableSurfacePosition.x;
      physics.setPosition(entity.id, {
        x: entity.contact.climbableSurfacePosition.x,
      });
      physics.setVelocity(entity.id, { x: 0 });
    }
  }
}
