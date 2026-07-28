import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetSpriteOverlay } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";

export const PET_WINDOW_FRAME_EVENT = "pet-window:frame:v1";
export const PET_WINDOW_RESIZE_EVENT = "pet-window:resize:v1";
export const PET_WINDOW_INPUT_EVENT = "pet-window:input:v1";
// Host -> pet window: the title of the window this pet is bound to, or null.
export const PET_WINDOW_BINDING_EVENT = "pet-window:binding:v1";
export const PET_WINDOW_HOST_LABEL = "main";

/** Label of the pet's own overlay window; mirrors the Rust side. */
export function petWindowLabel(petId: string) {
  return `pet-window-${petId}`;
}

export type PetWindowBindingEvent = {
  petId: string;
  title: string | null;
  isLoading?: boolean;
  /** True while connect-mode waits for the user to pick a window. */
  isConnecting?: boolean;
};

export type PetWindowOverlay = PetSpriteOverlay;

export type PetWindowFrame = {
  schemaVersion: 1;
  sequence: number;
  petId: string;
  name?: string;
  /**
   * The Pet Asset the window should be wearing. A pet's look is editable after
   * adoption, but the overlay window's URL — which carries the asset id it was
   * opened with — is fixed for the life of the window, so the live value has to
   * ride the frame stream like the name and folder do.
   */
  assetId?: string;
  cwd?: string;
  /**
   * The pet's free-form note. Rides the frame stream for the same reason the
   * name and folder do — the window cannot re-read its own URL — and because
   * the note is edited from the context menu while the window is open, so the
   * pet has to learn about its own note without being reopened.
   */
  memo?: string;
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
  /** The atlas animation row the pet is currently playing. */
  animationState: PetAnimationState;
  /** Engine-canonical current activity, for the status capsule label. */
  activity?: PetActivityKind | null;
  /**
   * The session partner's display name when the pet is in a live social
   * session, so the capsule can read "Chatting with Otto". Null otherwise.
   */
  partnerName?: string | null;
  /**
   * True while an agent task is actively running (AgentTaskState.status ===
   * "working"). Lets the window show a persistent working capsule for the whole
   * task, not just while a transient agent-channel line is live.
   */
  working?: boolean;
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
  | "menu.pick-folder"
  | "menu.note-save"
  | "menu.start-session"
  | "menu.find-terminal"
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

export function isFreshPetWindowMessage(lastSequence: number, nextSequence: number) {
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
