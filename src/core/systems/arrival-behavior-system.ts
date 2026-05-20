import type {
  MotionTargetComponent,
  TransformComponent,
  WandersOnArrivalComponent,
} from "@/core/components/simulation-components";

type ArrivalBehaviorEntity = {
  transform: TransformComponent;
  motion: MotionTargetComponent;
  wandersOnArrival: WandersOnArrivalComponent;
};

export function runArrivalBehaviorSystem(entities: ArrivalBehaviorEntity[]) {
  for (const entity of entities) {
    if (entity.motion.targetEntityId) {
      continue;
    }

    const target = entity.motion.targetPosition;
    if (!target) {
      continue;
    }

    const distance = Math.hypot(
      target.x - entity.transform.position.x,
      target.y - entity.transform.position.y,
    );

    if (distance > entity.wandersOnArrival.arrivalRadius) {
      continue;
    }

    entity.motion.targetEntityId = null;
    entity.motion.targetPosition = null;
  }
}
