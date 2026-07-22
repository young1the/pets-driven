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

export type ThrowImpulseComponent = {
  type: "ThrowImpulse";
  velocity: Vector;
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
