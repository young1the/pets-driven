import type { Vector } from "@/features/physics/components";

/**
 * Walk movement capability and tuning. WalkingState decides whether this
 * capability is currently active.
 */
export type CanWalkComponent = {
  type: "CanWalk";
  speed: number;
};

/** Defines how quickly the entity moves for each intent. */
export type MovementProfileComponent = {
  type: "MovementProfile";
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
};

/** Stores temporary pathing decisions, such as predictive avoidance waypoints. */
export type NavigationStateComponent = {
  type: "NavigationState";
  avoidanceWaypoint: Vector | null;
};

/**
 * Personality component for pets that keep wandering after reaching a target.
 */
export type WandersOnArrivalComponent = {
  type: "WandersOnArrival";
  arrivalRadius: number;
};
