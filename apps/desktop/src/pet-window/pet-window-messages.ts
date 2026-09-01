import type { PetActivityKind } from "@pets-driven/pet-engine/core/pet-activity";
import type {
  GameControlSource,
  GamePhase,
} from "@pets-driven/pet-engine/features/game/components";
import type { PetItemKind } from "@pets-driven/pet-engine/features/items/components";
import type { CarriedItemCountdown } from "@pets-driven/pet-engine/features/items/item-presentation";
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
  note?: string;
  /**
   * Quiet Mode is on for the desktop. Rides the frame for the one thing the
   * window says without being told to — its note's idle recital. Everything
   * else it speaks is the engine's line, and the engine has already fallen
   * silent by the time the frame is built.
   */
  quiet?: boolean;
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

/**
 * The trinket ability a pet is wearing, and how long it has left.
 *
 * Only the kind travels, not the glyph or a label: the window resolves those
 * itself (presentWorldItem, i18n) so a trinket reads the same wherever it is
 * drawn and the label is localized in the surface that shows it.
 */
export type PetWindowCarrying = CarriedItemCountdown & {
  kind: PetItemKind;
};

/**
 * A round as the pet wears it.
 *
 * The engine's own snapshot of the session, trimmed to what draws: the host
 * decides where the pill goes, not what a round *is*, so every number here is
 * resolved in the engine and copied across (see PetGameSnapshot).
 */
export type PetWindowGame = {
  phase: GamePhase;
  /**
   * Who is driving. The lane only means anything to the hand on the keys — a
   * pet flying its own round is pinned to the anchor — so this is what decides
   * whether the lane is worth drawing at all.
   */
  control: GameControlSource;
  /** The opening 3-2-1 glyph, or null once the round is under way. */
  countdown: string | null;
  /** Obstacles put behind the pet untouched. */
  cleared: number;
  /**
   * Where the pet stands in its lane and how far the lane runs either way, in
   * engine pixels, or null when there is nothing to measure. `offset` is signed
   * from the line the round started on; forward is toward the oncoming course.
   */
  lane: { offset: number; forward: number; back: number } | null;
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
  /**
   * The round this pet is on, or absent when it is living its ordinary life.
   *
   * Rides beside the agent line rather than replacing it: the whole of it draws
   * in the notice pill above the pet, the slot the terminal-binding prompt
   * uses, so a working pet keeps its own status capsule while it plays.
   *
   * It carries more than the countdown because everything else about a round
   * was invisible. Nothing said a round was under way once the 3-2-1 ended,
   * nothing said an obstacle had been cleared, and nothing said the pet had
   * anywhere to go — so a round read as scenery sliding past a pet that had
   * stopped for no reason.
   */
  game?: PetWindowGame | null;
  /**
   * The ability the pet picked up, counting down, or null when it has none.
   *
   * Last in this type on purpose: `isSamePetWindowPresentation` compares
   * serialized sprites, so the surface's reconstruction of the previous sprite
   * has to list its keys in this same order to compare equal.
   */
  carrying?: PetWindowCarrying | null;
};

export type PetWindowResizeEvent = {
  petId: string;
  scale: number;
};

export type PetWindowInputKind =
  // The pointer is holding something in the surface (a drag, a resize) and the
  // host must not hand the mouse back until it lets go. Only the single-window
  // overlay acts on these: it is the one surface whose interactivity the host
  // decides from where the cursor is, and a throw or a resize is exactly the
  // gesture that carries the cursor off the pet it started on.
  | "surface.capture.start"
  | "surface.capture.end"
  | "body.pointer.down"
  | "body.pointer.move"
  | "body.pointer.up"
  // A control key pressed while this window holds focus. It names no point and
  // no pet: the world it reaches decides which pet it steers, from the press
  // that selected one. See usePetWindowKeyboardControl.
  | "body.key.down"
  | "body.key.up"
  // This surface stopped hearing keys: it stands for every key-up that will
  // now never arrive, and hands back the pet it was holding.
  | "body.key.blur"
  | "body.focus"
  | "menu.close"
  | "menu.pick-folder"
  | "menu.note-save"
  | "menu.start-session"
  | "menu.find-terminal"
  | "menu.unbind"
  | "menu.request-binding"
  // Put this pet on a course, or take the running one off it. One session for
  // the whole desktop, so the host reads it as a toggle.
  | "menu.game-toggle"
  // The same toggle for a plain round on a rhythm, with no agent involved.
  // Two kinds rather than one carrying a payload, so a menu row and the thing
  // it does stay one to one — the way every other menu signal here reads.
  | "menu.game-practice"
  // Stop whatever kind of round this pet is on. Distinct from the two above,
  // which each toggle *their* kind: a "stop" that had to name the kind it was
  // stopping would switch the course instead of ending it whenever the two
  // disagreed.
  | "menu.game-stop"
  | "overlay.click"
  | "body.contextmenu"
  | "overlay.contextmenu";

export type PetWindowInputEvent = {
  sequence: number;
  /**
   * The world entity this input is about. Named for the only sender there used
   * to be; a prop window puts its own entity id here and says so via `entity`.
   */
  petId: string;
  /**
   * Which kind of entity `petId` names. Absent means a pet, so every existing
   * sender keeps working untouched.
   *
   * The host needs this and cannot infer it: it decides which world an input
   * belongs to by looking the id up in the adopted pet roster, and a prop is in
   * that world without ever being in that roster. Nothing past that lookup
   * cares — a drag is hit-tested by world position against `CanDrag`, so the
   * engine never learns which window the pointer came from.
   */
  entity?: "pet" | "prop";
  petName?: string;
  windowLabel: string;
  pointerId: number;
  kind: PetWindowInputKind;
  localPoint: { x: number; y: number };
  screenPoint: { x: number; y: number };
  button?: number;
  /**
   * The key of a `body.key.*` input: `code` is the physical key the engine
   * steers by (layout-independent, so WASD stays WASD on any keyboard), `key`
   * the character it produced. Absent on every other kind.
   */
  key?: string;
  code?: string;
  note?: string;
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
