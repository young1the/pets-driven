import type { PetWindowFrame } from "@/pet-window/pet-window-messages";
import { petWindowTransport, type Unsubscribe } from "@/pet-window/pet-window-transport";

/**
 * What a pet surface can ask of whatever is hosting it.
 *
 * A pet renders the same either way, but *where it lives* differs: in
 * window-per-pet mode it is alone in an OS window it may resize, drag and hand
 * the mouse back from, and in single-window overlay mode it is one of several
 * elements inside a window it shares and does not own. This is the seam between
 * those two — `usePetWindowSurface` states its intent, and the host that
 * actually has the authority carries it out or ignores it.
 */
export type PetSurfaceHost = {
  /** This pet's frames alone; frames for other pets never reach the handler. */
  subscribeFrame(petId: string, handler: (frame: PetWindowFrame) => void): Promise<Unsubscribe>;
  /** The pet's frame is now this big in logical pixels. */
  applyFrameSize(width: number, height: number): void;
  /** Let the OS drag the surface, for a pet the host is not yet positioning. */
  startDrag(): void;
  /** Whether the pointer is over transparent space and belongs to the desktop. */
  setCursorPassthrough(ignore: boolean): void;
  /**
   * Whether a gesture is holding the surface. A drag or a resize carries the
   * cursor off the pet it started on, and a host that decides interactivity
   * from where the cursor is has to be told to hold on regardless.
   */
  notifyCapture(active: boolean): void;
};

let restoreCursorEventsTimer: number | null = null;

/**
 * The pet owns its OS window: every request is a real window operation.
 *
 * Passthrough is armed with a timer that puts the window back in the mouse's
 * way shortly after: the window stops receiving the moves that would tell it
 * the pointer came back, so nothing else would ever undo it.
 */
export const ownWindowPetSurfaceHost: PetSurfaceHost = {
  async subscribeFrame(petId, handler) {
    return await petWindowTransport.subscribeFrame((frame) => {
      if (frame.petId === petId) {
        handler(frame);
      }
    });
  },

  applyFrameSize(width, height) {
    void petWindowTransport.setWindowSize(width, height);
  },

  startDrag() {
    void petWindowTransport.startDragging();
  },

  setCursorPassthrough(ignore) {
    if (!petWindowTransport.isDesktopRuntime()) {
      return;
    }

    if (restoreCursorEventsTimer !== null) {
      window.clearTimeout(restoreCursorEventsTimer);
      restoreCursorEventsTimer = null;
    }

    if (ignore) {
      restoreCursorEventsTimer = window.setTimeout(() => {
        restoreCursorEventsTimer = null;
        void petWindowTransport.setIgnoreCursorEvents(false);
      }, 180);
    }

    void petWindowTransport.setIgnoreCursorEvents(ignore);
  },

  notifyCapture() {
    // The window is only ever over its own pet, so it is never in anything's
    // way and has nothing to hold on to.
  },
};
