import type { EntityDeclaration } from "@pets-driven/pet-engine/core/component-store";
import {
  BALL_ENTITY_ID,
  BALL_MATERIAL,
  BALL_RADIUS,
  type WorldPropKind,
} from "@pets-driven/pet-engine/features/props/components";

/**
 * The ball, as a scenario declares it.
 *
 * Nothing here is prop-specific except `WorldProp` itself: the body, the
 * material and `CanDrag` are the same components a pet carries, which is what
 * buys the ball gravity, bouncing, grabbing and throwing without a line of code
 * in the physics or interaction slices knowing it exists.
 *
 * `position` is the ball's centre. A caller that wants it resting on a floor
 * should pass the floor's top surface minus BALL_RADIUS; dropping it from
 * higher is fine too — it falls, which is rather the point.
 */
export function createBallProp(
  position: { x: number; y: number },
  now = 0,
  id: string = BALL_ENTITY_ID,
): EntityDeclaration {
  return {
    id,
    components: [
      { type: "WorldProp", kind: "ball", spawnedAt: now, lastKickBy: null, lastKickAt: 0 },
      { type: "Transform", position: { ...position } },
      {
        type: "PhysicsBody",
        shape: "circle",
        width: BALL_RADIUS * 2,
        height: BALL_RADIUS * 2,
      },
      { type: "PhysicsMaterial", ...BALL_MATERIAL },
      // The user can pick the ball up and throw it, through exactly the path
      // that picks up and throws a pet.
      { type: "CanDrag" },
    ],
  };
}

/**
 * Build a prop of any kind. A record rather than a switch so adding a kind to
 * `WorldPropKind` fails to type-check until there is something to build for it
 * — the same reason the presentation catalogue is a record.
 */
const PROP_BUILDERS: Record<
  WorldPropKind,
  (position: { x: number; y: number }, now: number, id: string) => EntityDeclaration
> = {
  ball: createBallProp,
};

export function createProp(
  kind: WorldPropKind,
  position: { x: number; y: number },
  now: number,
  id: string,
): EntityDeclaration {
  return PROP_BUILDERS[kind](position, now, id);
}
