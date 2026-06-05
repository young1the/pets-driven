import type { PetSpriteIntent } from "@/pets/rendering/pet-sprite-intent";
import type { PetSpriteOverlay } from "@/pets/rendering/pet-sprite";

export const PET_WINDOW_FRAME_EVENT = "pet-window:frame:v1";
export const PET_WINDOW_INPUT_EVENT = "pet-window:input:v1";
export const PET_WINDOW_HOST_LABEL = "main";

export type PetWindowOverlay = PetSpriteOverlay;

export type PetWindowFrame = {
  schemaVersion: 1;
  sequence: number;
  petId: string;
  window: PetWindowFrameWindow;
  sprite: PetWindowFrameSprite;
  overlay: PetWindowOverlay | null;
};

export type PetWindowFrameWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PetWindowFrameSprite = {
  intent: PetSpriteIntent;
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

export function isSamePetWindowPresentation(
  previous: Pick<PetWindowFrame, "sprite" | "overlay">,
  next: Pick<PetWindowFrame, "sprite" | "overlay">,
) {
  return (
    JSON.stringify(previous.sprite) === JSON.stringify(next.sprite) &&
    JSON.stringify(previous.overlay) === JSON.stringify(next.overlay)
  );
}
