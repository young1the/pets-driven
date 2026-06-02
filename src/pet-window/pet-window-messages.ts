import type { PetSpriteIntent } from "@/pets/rendering/pet-sprite-intent";

export const PET_WINDOW_POSITION_EVENT = "pet-window:position:v1";
export const PET_WINDOW_PRESENTATION_EVENT = "pet-window:presentation:v1";
export const PET_WINDOW_INPUT_EVENT = "pet-window:input:v1";
export const PET_WINDOW_HOST_LABEL = "main";

export type PetWindowOverlay = {
  kind: "attention" | "speech" | "status";
  label: string;
};

export type PetWindowPositionUpdate = {
  sequence: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type PetWindowPresentationUpdate = {
  sequence: number;
  intent: PetSpriteIntent;
  overlay: PetWindowOverlay | null;
};

export type PetWindowInputKind =
  | "body.pointer.down"
  | "body.pointer.move"
  | "body.pointer.up"
  | "overlay.click"
  | "body.contextmenu"
  | "overlay.contextmenu";

export type PetWindowInputEvent = {
  sequence: number;
  petId: string;
  windowLabel: string;
  pointerId: number;
  kind: PetWindowInputKind;
  localPoint: { x: number; y: number };
  screenPoint: { x: number; y: number };
  button?: number;
  at: number;
};

export function isFreshPetWindowMessage(
  lastSequence: number,
  nextSequence: number,
) {
  return nextSequence > lastSequence;
}
