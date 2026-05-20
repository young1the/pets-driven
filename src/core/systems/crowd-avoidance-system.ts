import type {
  AvoidsCrowdsComponent,
  Vector,
} from "@/core/components/simulation-components";
import type { Force } from "@/core/systems/physics-integration-system";

type CrowdAvoidingEntity = {
  id: string;
  position: Vector;
  avoidsCrowds: AvoidsCrowdsComponent;
};

type CrowdObstacle = {
  id: string;
  position: Vector;
};

export function runCrowdAvoidanceSystem(
  entities: CrowdAvoidingEntity[],
  obstacles: CrowdObstacle[],
): Force[] {
  return entities.flatMap((entity) => {
    const total = obstacles
      .filter((obstacle) => obstacle.id !== entity.id)
      .reduce(
        (force, obstacle) => {
          const dx = obstacle.position.x - entity.position.x;
          const dy = obstacle.position.y - entity.position.y;
          const distance = Math.hypot(dx, dy);

          if (distance === 0 || distance > entity.avoidsCrowds.radius) {
            return force;
          }

          const pressure = (entity.avoidsCrowds.radius - distance) / entity.avoidsCrowds.radius;
          return {
            x: force.x - (dx / distance) * entity.avoidsCrowds.strength * pressure,
            y: force.y - (dy / distance) * entity.avoidsCrowds.strength * pressure,
          };
        },
        { x: 0, y: 0 },
      );

    if (total.x === 0 && total.y === 0) {
      return [];
    }

    return [{ id: entity.id, ...total }];
  });
}
