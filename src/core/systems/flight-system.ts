import type {
  FlightMovementComponent,
  LocomotionStateComponent,
} from "@/core/components/simulation-components";

type FlightEntity = {
  id: string;
  locomotion: LocomotionStateComponent;
  flight: FlightMovementComponent;
};

type FlightPhysics = {
  setGravityScale(id: string, scale: number): void;
  applyForce(id: string, force: { x: number; y: number }): void;
};

export function runFlightSystem(entities: FlightEntity[], physics: FlightPhysics) {
  for (const entity of entities) {
    if (entity.locomotion.baseMode !== "fly") {
      continue;
    }

    physics.setGravityScale(entity.id, entity.flight.gravityScale);

    if (entity.flight.hoverStrength > 0) {
      physics.applyForce(entity.id, { x: 0, y: -entity.flight.hoverStrength });
    }
  }
}
