import type {
  IntentStateComponent,
  MotionTargetComponent,
  MovementProfileComponent,
  NavigationStateComponent,
} from "@/core/components/simulation-components";

export const MOTION_ARRIVAL_RADIUS = 16;

const MOTION_SLOW_RADIUS = 96;

export type SteeringPet = {
  id: string;
  position: { x: number; y: number };
  movement: MovementProfileComponent;
  intent: IntentStateComponent;
  motion: MotionTargetComponent;
  navigation?: NavigationStateComponent;
};

export function runIntentSteeringSystem(pets: SteeringPet[]) {
  return pets.map((pet) => {
    const target = pet.navigation?.avoidanceWaypoint ?? pet.motion.targetPosition;
    if (!target) {
      return { id: pet.id, x: 0, y: 0 };
    }

    const dx = target.x - pet.position.x;
    const dy = target.y - pet.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= MOTION_ARRIVAL_RADIUS) {
      return { id: pet.id, x: 0, y: 0 };
    }

    const speed =
      pet.intent.intent === "seek"
        ? pet.movement.seekSpeed
        : pet.intent.intent === "active"
          ? pet.movement.activeSpeed
          : pet.movement.idleSpeed;

    const easedSpeed =
      distance >= MOTION_SLOW_RADIUS
        ? speed
        : speed * ((distance - MOTION_ARRIVAL_RADIUS) / (MOTION_SLOW_RADIUS - MOTION_ARRIVAL_RADIUS));

    return {
      id: pet.id,
      x: (dx / distance) * easedSpeed,
      y: (dy / distance) * easedSpeed,
    };
  });
}
