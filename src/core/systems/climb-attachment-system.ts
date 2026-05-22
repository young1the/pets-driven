import type {
  ClimbingStateComponent,
  ContactStateComponent,
} from "@/core/components/simulation-components";

type ClimbAttachmentEntity = {
  id: string;
  climbing: ClimbingStateComponent;
  contact: ContactStateComponent;
};

type VelocityWritablePhysics = {
  setVelocity(id: string, velocity: { x?: number; y?: number }): void;
};

export function runClimbAttachmentSystem(
  entities: ClimbAttachmentEntity[],
  physics: VelocityWritablePhysics,
) {
  for (const entity of entities) {
    if (entity.contact.climbableSurfaceId) {
      physics.setVelocity(entity.id, { x: 0 });
    }
  }
}
