import type { Vector } from "@pets-driven/pet-engine/features/physics/components";

export type CanDragComponent = {
  type: "CanDrag";
};

export type CanControlComponent = {
  type: "CanControl";
  speed: number;
};

export type KeyboardControlTargetComponent = {
  type: "KeyboardControlTarget";
  entityId: string | null;
};

export type KeyboardInputStateComponent = {
  type: "KeyboardInputState";
  pressedCodes: string[];
  vector: Vector;
};

export type DragInteractionPhase = "pending" | "dragging";

export type DragSample = {
  at: number;
  position: Vector;
};

export type DragInteractionComponent = {
  type: "DragInteraction";
  pointerId: number;
  entityId: string;
  phase: DragInteractionPhase;
  grabOffset: Vector;
  pointerPosition: Vector;
  startedAt: number;
  samples: DragSample[];
};

/**
 * A one-shot velocity change ThrowImpulseSystem hands to the physics body.
 *
 * `mode` decides what "impulse" means here, and the default is the older of the
 * two meanings so every existing writer keeps its behavior:
 *
 * - `"set"` replaces the body's velocity outright. This is what a *throw* is:
 *   the user's flick is a statement about where the pet goes next, and whatever
 *   it was doing beforehand is beside the point.
 * - `"add"` adds to what the body is already doing, which is what an impulse
 *   between two bodies actually is. A kick uses this: replacing the ball's
 *   velocity threw away its momentum, so a ball booted from behind while it was
 *   already rolling fast came out *slower* than it went in.
 *
 * Additive impulses are clamped to the same speed ceiling a throw is, so the
 * sum can never clear a boundary wall in one tick.
 */
export type ThrowImpulseComponent = {
  type: "ThrowImpulse";
  velocity: Vector;
  mode?: "set" | "add";
};

/**
 * Tracks the most recent tap (a press that never became a drag) so two quick
 * taps on the same pet can be recognized as a double-click. Lives on the
 * "user-interaction" entity alongside DragInteraction. `entityId` is the pet
 * that was tapped, reset to null once a double-click has fired so a third tap
 * does not chain into another one.
 */
export type TapGestureStateComponent = {
  type: "TapGestureState";
  entityId: string | null;
  lastTapAt: number;
};
