import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { PET_OVERLAY_FRAME_EVENT, type PetOverlayFrame } from "@/pet-window/pet-overlay-messages";
import {
  PET_WINDOW_BINDING_EVENT,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_RESIZE_EVENT,
  type PetWindowBindingEvent,
  type PetWindowFrame,
  type PetWindowInputEvent,
  type PetWindowResizeEvent,
} from "@/pet-window/pet-window-messages";

/** Unsubscribe handle returned by the transport's event subscriptions. */
export type Unsubscribe = () => void;

const NOOP_UNSUBSCRIBE: Unsubscribe = () => {};

/**
 * The single IPC boundary between a pet overlay (or its context menu) webview
 * and the host window. It owns the inbound host->window streams (frame,
 * binding), the outbound window->host signals (input, resize), and control of
 * the webview's own OS window. Outside the Tauri shell every method is an inert
 * no-op, so callers never branch on the runtime themselves.
 */
export type PetWindowTransport = {
  /** Whether we're running inside the Tauri desktop shell (vs. browser/tests). */
  isDesktopRuntime(): boolean;
  /** This webview's OS window label. Empty string outside Tauri. */
  windowLabel(): string;

  // Host -> window streams. Handlers receive the domain payload directly.
  subscribeFrame(handler: (frame: PetWindowFrame) => void): Promise<Unsubscribe>;
  /** The whole roster in one tick, for the single-window overlay. */
  subscribeOverlayFrame(handler: (frame: PetOverlayFrame) => void): Promise<Unsubscribe>;
  subscribeBinding(handler: (binding: PetWindowBindingEvent) => void): Promise<Unsubscribe>;
  subscribeWindowFocus(handler: () => void): Promise<Unsubscribe>;
  subscribeWindowBlur(handler: () => void): Promise<Unsubscribe>;

  // Window -> host signals.
  /**
   * Hand one input event to the host window. Resolves when the emit lands and
   * rejects when it does not — a caller that wants to know whether its input
   * reached anything has no other way to find out.
   */
  sendInput(payload: PetWindowInputEvent): Promise<void>;
  sendResize(payload: PetWindowResizeEvent): void;

  // Control of this webview's own OS window. Position is absent on purpose: the
  // host places every pet window natively in one batch (place_pet_windows), so
  // an overlay never moves itself.
  setWindowSize(width: number, height: number): Promise<void>;
  showWindow(): Promise<void>;
  focusWindow(): Promise<void>;
  hideWindow(): Promise<void>;
  startDragging(): Promise<void>;
  setIgnoreCursorEvents(ignore: boolean): Promise<void>;
};

export const petWindowTransport: PetWindowTransport = {
  isDesktopRuntime() {
    return isTauri();
  },

  windowLabel() {
    return isTauri() ? getCurrentWindow().label : "";
  },

  async subscribeFrame(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<PetWindowFrame>(PET_WINDOW_FRAME_EVENT, (event) => handler(event.payload));
  },

  async subscribeOverlayFrame(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<PetOverlayFrame>(PET_OVERLAY_FRAME_EVENT, (event) =>
      handler(event.payload),
    );
  },

  async subscribeBinding(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen<PetWindowBindingEvent>(PET_WINDOW_BINDING_EVENT, (event) =>
      handler(event.payload),
    );
  },

  async subscribeWindowFocus(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen("tauri://focus", () => handler());
  },

  async subscribeWindowBlur(handler) {
    if (!isTauri()) {
      return NOOP_UNSUBSCRIBE;
    }

    return await listen("tauri://blur", () => handler());
  },

  async sendInput(payload) {
    if (!isTauri()) {
      return;
    }

    // Awaited rather than dropped on the floor. A rejected emit is how a window
    // whose capability does not permit it fails, and a bare `void` turns that
    // into an input path that is silently dead — a long way to debug from
    // "clicking does nothing".
    await emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_INPUT_EVENT, payload);
  },

  sendResize(payload) {
    if (!isTauri()) {
      return;
    }

    void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_RESIZE_EVENT, payload);
  },

  async setWindowSize(width, height) {
    if (!isTauri()) {
      return;
    }

    await getCurrentWindow().setSize(new LogicalSize(width, height));
  },

  async showWindow() {
    if (!isTauri()) {
      return;
    }

    await getCurrentWindow().show();
  },

  async focusWindow() {
    if (!isTauri()) {
      return;
    }

    await getCurrentWindow().setFocus();
  },

  async hideWindow() {
    if (!isTauri()) {
      return;
    }

    await getCurrentWindow().hide();
  },

  async startDragging() {
    if (!isTauri()) {
      return;
    }

    await getCurrentWindow().startDragging();
  },

  async setIgnoreCursorEvents(ignore) {
    if (!isTauri()) {
      return;
    }

    await getCurrentWindow().setIgnoreCursorEvents(ignore);
  },
};
