import type {
  ClimbIntentStateComponent,
  IntentStateComponent,
  LocomotionStateComponent,
  MotionTargetComponent,
  TransformComponent,
  WandersOnArrivalComponent,
} from "@/core/components/simulation-components";

type ArrivalBehaviorEntity = {
  intent: IntentStateComponent;
  locomotion: LocomotionStateComponent;
  transform: TransformComponent;
  motion: MotionTargetComponent;
  wandersOnArrival: WandersOnArrivalComponent;
  climbIntent?: ClimbIntentStateComponent | null;
};

type AnchorPosition = {
  id: string;
  position: { x: number; y: number };
};

export function runArrivalBehaviorSystem(
  entities: ArrivalBehaviorEntity[],
  anchors: AnchorPosition[],
) {
  for (const entity of entities) {
    if (entity.motion.targetEntityId) {
      if (entity.intent.intent !== "seek") continue;

      const anchor = anchors.find((a) => a.id === entity.motion.targetEntityId);
      if (!anchor) continue;

      const distance = Math.hypot(
        anchor.position.x - entity.transform.position.x,
        anchor.position.y - entity.transform.position.y,
      );
      if (distance > entity.wandersOnArrival.arrivalRadius) continue;

      entity.intent.intent = "idle";
      entity.motion.targetEntityId = null;
      entity.motion.targetPosition = null;
      continue;
    }

    const target = entity.motion.targetPosition;
    if (!target) {
      continue;
    }

    if (entity.climbIntent?.phase === "approaching") {
      continue;
    }

    const delta =
      entity.locomotion.baseMode === "climb"
        ? Math.abs(target.y - entity.transform.position.y)
        : Math.abs(target.x - entity.transform.position.x);

    if (delta > entity.wandersOnArrival.arrivalRadius) {
      continue;
    }

    entity.motion.targetEntityId = null;
    entity.motion.targetPosition = null;
  }
}
