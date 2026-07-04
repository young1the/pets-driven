import type { PetSpriteIntent } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-intent";
import type { PetSpriteOverlay } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";

export const PET_WINDOW_FRAME_EVENT = "pet-window:frame:v1";
export const PET_WINDOW_RESIZE_EVENT = "pet-window:resize:v1";
export const PET_WINDOW_INPUT_EVENT = "pet-window:input:v1";
// Host -> pet window: the title of the window this pet is bound to, or null.
export const PET_WINDOW_BINDING_EVENT = "pet-window:binding:v1";
export const PET_WINDOW_HOST_LABEL = "main";

export type PetWindowBindingEvent = {
  petId: string;
  title: string | null;
  isLoading?: boolean;
};

export type PetWindowOverlay = PetSpriteOverlay;

export type PetWindowFrame = {
  schemaVersion: 1;
  sequence: number;
  petId: string;
  name?: string;
  cwd?: string;
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
  decisionEmote?: BehaviorTokenPresentation | null;
  intent: PetSpriteIntent;
  /** Engine-canonical current activity, for the status capsule label. */
  activity?: PetActivityKind | null;
};

export type PetWindowResizeEvent = {
  petId: string;
  scale: number;
};

export type PetWindowInputKind =
  | "body.pointer.down"
  | "body.pointer.move"
  | "body.pointer.up"
  | "body.focus"
  | "menu.close"
  | "menu.note-save"
  | "menu.start-session"
  | "menu.unbind"
  | "menu.request-binding"
  | "overlay.click"
  | "body.contextmenu"
  | "overlay.contextmenu";

export type PetWindowInputEvent = {
  sequence: number;
  petId: string;
  petName?: string;
  windowLabel: string;
  pointerId: number;
  kind: PetWindowInputKind;
  localPoint: { x: number; y: number };
  screenPoint: { x: number; y: number };
  button?: number;
  memo?: string;
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
