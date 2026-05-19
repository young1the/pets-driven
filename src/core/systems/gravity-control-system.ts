import type {
  FlyableComponent,
  GravityScaleComponent,
} from "@/core/components/simulation-components";

type GravityControlledEntity = {
  id: string;
  gravityScale: GravityScaleComponent;
  flyable?: FlyableComponent;
};

type GravityControlledPhysics = {
  setGravityScale(id: string, scale: number): void;
  applyForce(id: string, force: { x: number; y: number }): void;
};

export function runGravityControlSystem(
  entities: GravityControlledEntity[],
  physics: GravityControlledPhysics,
) {
  for (const entity of entities) {
    physics.setGravityScale(entity.id, entity.gravityScale.scale);

    if (entity.flyable && entity.flyable.hoverStrength > 0) {
      physics.applyForce(entity.id, { x: 0, y: -entity.flyable.hoverStrength });
    }
  }
}
