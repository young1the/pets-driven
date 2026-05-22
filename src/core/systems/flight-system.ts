import type {
  CanFlyComponent,
  FlyingStateComponent,
} from "@/core/components/simulation-components";

type FlightEntity = {
  id: string;
  flying: FlyingStateComponent;
  canFly: CanFlyComponent;
};

type FlightPhysics = {
  setGravityScale(id: string, scale: number): void;
  applyForce(id: string, force: { x: number; y: number }): void;
};

export function runFlightSystem(entities: FlightEntity[], physics: FlightPhysics) {
  for (const entity of entities) {
    physics.setGravityScale(entity.id, entity.canFly.gravityScale);

    if (entity.canFly.hoverStrength > 0) {
      physics.applyForce(entity.id, { x: 0, y: -entity.canFly.hoverStrength });
    }
  }
}
