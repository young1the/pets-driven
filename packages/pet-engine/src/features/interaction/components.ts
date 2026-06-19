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
