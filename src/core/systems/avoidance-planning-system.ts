import type {
  MotionTargetComponent,
  NavigationStateComponent,
  Vector,
} from "@/core/components/simulation-components";

const AVOIDANCE_PATH_RADIUS = 48;
const AVOIDANCE_WAYPOINT_OFFSET = 72;

type NavigatingPet = {
  id: string;
  position: Vector;
  motion: MotionTargetComponent;
  navigation: NavigationStateComponent;
};

type AvoidanceObstacle = {
  id: string;
  position: Vector;
};

export function runAvoidancePlanningSystem(
  pets: NavigatingPet[],
  obstacles: AvoidanceObstacle[],
) {
  for (const pet of pets) {
    const target = pet.motion.targetPosition;
    if (!target) {
      pet.navigation.avoidanceWaypoint = null;
      continue;
    }

    const dx = target.x - pet.position.x;
    const dy = target.y - pet.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared === 0) {
      pet.navigation.avoidanceWaypoint = null;
      continue;
    }

    const nearestBlocker = obstacles
      .filter((obstacle) => obstacle.id !== pet.id)
      .map((obstacle) => {
        const ox = obstacle.position.x - pet.position.x;
        const oy = obstacle.position.y - pet.position.y;
        const progress = (ox * dx + oy * dy) / distanceSquared;
        const closestPoint = {
          x: pet.position.x + dx * progress,
          y: pet.position.y + dy * progress,
        };
        const clearance = Math.hypot(obstacle.position.x - closestPoint.x, obstacle.position.y - closestPoint.y);

        return { obstacle, closestPoint, clearance, progress };
      })
      .filter(
        (candidate) =>
          candidate.progress > 0 &&
          candidate.progress < 1 &&
          candidate.clearance <= AVOIDANCE_PATH_RADIUS,
      )
      .sort((left, right) => left.progress - right.progress)[0];

    if (!nearestBlocker) {
      pet.navigation.avoidanceWaypoint = null;
      continue;
    }

    const distance = Math.sqrt(distanceSquared);
    const normal = { x: dx / distance, y: dy / distance };
    const perpendicular = { x: -normal.y, y: normal.x };
    const obstacleVector = {
      x: nearestBlocker.obstacle.position.x - pet.position.x,
      y: nearestBlocker.obstacle.position.y - pet.position.y,
    };
    const obstacleSide = normal.x * obstacleVector.y - normal.y * obstacleVector.x;
    const side = obstacleSide >= 0 ? -1 : 1;

    pet.navigation.avoidanceWaypoint = {
      x: nearestBlocker.closestPoint.x + perpendicular.x * AVOIDANCE_WAYPOINT_OFFSET * side,
      y: nearestBlocker.closestPoint.y + perpendicular.y * AVOIDANCE_WAYPOINT_OFFSET * side,
    };
  }
}
