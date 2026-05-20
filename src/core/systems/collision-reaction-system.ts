import type {
  IntentStateComponent,
  MotionTargetComponent,
  PhysicsBodyComponent,
  TransformComponent,
  Vector,
} from "@/core/components/simulation-components";

const COLLISION_REACTION_DISTANCE = 96;
const COLLISION_TARGET_MARGIN = 48;

type CollisionReactionEntity = {
  id: string;
  transform: TransformComponent;
  body: PhysicsBodyComponent;
  intent: IntentStateComponent;
  motion: MotionTargetComponent;
};

type WorldBounds = {
  width: number;
  height: number;
};

export function runCollisionReactionSystem(
  entities: CollisionReactionEntity[],
  bounds: WorldBounds,
) {
  for (const entity of entities) {
    const collision = entities.find(
      (candidate) =>
        candidate.id !== entity.id && rectanglesOverlap(entity, candidate),
    );

    if (!collision) {
      continue;
    }

    const reactionDirection = getReactionDirection(entity, collision);
    entity.motion.targetEntityId = null;
    entity.motion.targetPosition = clampTarget(
      {
        x:
          entity.transform.position.x +
          reactionDirection.x * COLLISION_REACTION_DISTANCE,
        y:
          entity.transform.position.y +
          reactionDirection.y * COLLISION_REACTION_DISTANCE,
      },
      bounds,
    );
  }
}

function rectanglesOverlap(
  left: CollisionReactionEntity,
  right: CollisionReactionEntity,
) {
  return (
    Math.abs(left.transform.position.x - right.transform.position.x) <
      (left.body.width + right.body.width) / 2 &&
    Math.abs(left.transform.position.y - right.transform.position.y) <
      (left.body.height + right.body.height) / 2
  );
}

function getReactionDirection(
  entity: CollisionReactionEntity,
  collision: CollisionReactionEntity,
) {
  const away = normalize({
    x: entity.transform.position.x - collision.transform.position.x,
    y: entity.transform.position.y - collision.transform.position.y,
  });

  if (entity.intent.intent === "idle") {
    return away;
  }

  const sideStep = normalize({ x: -away.y, y: away.x });
  if (entity.intent.intent === "active") {
    return normalize({
      x: away.x + sideStep.x,
      y: away.y + sideStep.y,
    });
  }

  const targetDirection = entity.motion.targetPosition
    ? normalize({
        x: entity.motion.targetPosition.x - entity.transform.position.x,
        y: entity.motion.targetPosition.y - entity.transform.position.y,
      })
    : away;

  return normalize({
    x: targetDirection.x + sideStep.x,
    y: targetDirection.y + sideStep.y,
  });
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function clampTarget(target: Vector, bounds: WorldBounds): Vector {
  return {
    x: clamp(target.x, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
    y: clamp(target.y, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
