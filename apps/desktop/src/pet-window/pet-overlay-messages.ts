import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PET_WINDOW_BUBBLE_OVERHEAD, PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import type { PetWindowFrame } from "@/pet-window/pet-window-messages";
import type { PetWindowPoint, PetWindowRect } from "@/pet-window/pet-window-types";

/** OS label of the single-window overlay; mirrors the Rust side. */
export const PET_OVERLAY_LABEL = "pet-overlay";

/** Host -> overlay: every visible pet's frame for one simulation tick. */
export const PET_OVERLAY_FRAME_EVENT = "pet-overlay:frame:v1";

/**
 * The whole roster in one message.
 *
 * Window-per-pet mode splits a tick in two — positions go to the shell as a
 * native batch, appearance goes to each pet's own webview — because moving an
 * OS window and repainting it are different costs. The single window has
 * neither split to make: there is one webview and nothing native to move, so a
 * tick is one event carrying every pet, whatever changed about it. That is the
 * mode's whole point: the per-tick cost stops scaling with the roster.
 */
export type PetOverlayFrame = {
  schemaVersion: 1;
  sequence: number;
  /**
   * The overlay window's own screen rect in logical pixels, so the surface can
   * turn a pet's screen position into a position inside its own document.
   * Travels with the frame rather than being read from the window because the
   * host is the one that decides it (see petOverlayWindowRect).
   */
  bounds: PetWindowRect;
  pets: PetWindowFrame[];
};

/**
 * Slack around the projection bounds when sizing the overlay window.
 *
 * A pet's frame is anchored so its *body* stands on the floor, which leaves the
 * bubble overhead above it and half a cell of margin around it — so a pet
 * standing at the very edge of a monitor draws outside the work area it walks
 * in. One cell of slack on every side is enough for any pet at any scale, and
 * the window is transparent and click-through, so the extra area costs nothing.
 */
const PET_OVERLAY_BOUNDS_SLACK = {
  x: PET_CELL_SIZE.width,
  y: PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD,
};

/** The screen rect the overlay window should cover for these projection bounds. */
export function petOverlayWindowRect(bounds: PetWindowRect): PetWindowRect {
  return {
    x: bounds.x - PET_OVERLAY_BOUNDS_SLACK.x,
    y: bounds.y - PET_OVERLAY_BOUNDS_SLACK.y,
    width: bounds.width + PET_OVERLAY_BOUNDS_SLACK.x * 2,
    height: bounds.height + PET_OVERLAY_BOUNDS_SLACK.y * 2,
  };
}

/**
 * Where one pet's visual frame sits on screen, in logical pixels.
 *
 * A frame's `window` rect is deliberately not that rect: it is the *fixed*
 * 192x268 OS window a pet gets in window-per-pet mode, with the scaled sprite
 * frame centred inside it (see pet-window.css and the note in
 * pet-window-projection.ts). The overlay draws the sprite frame directly, so it
 * has to undo that centring — which keeps both modes on one projection, and a
 * pet's feet in the same place when the user switches between them.
 */
export function petOverlayFrameRect(frame: PetWindowFrame): PetWindowRect {
  return {
    x: frame.window.x + (PET_CELL_SIZE.width - frame.window.width) / 2,
    y:
      frame.window.y +
      (PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD - frame.window.height) / 2,
    width: frame.window.width,
    height: frame.window.height,
  };
}

/** The same rect relative to the overlay window's own top-left corner. */
export function petOverlayFrameOffset(frame: PetWindowFrame, bounds: PetWindowRect) {
  const rect = petOverlayFrameRect(frame);

  return {
    ...rect,
    x: rect.x - bounds.x,
    y: rect.y - bounds.y,
  };
}

function inflate(rect: PetWindowRect, margin: number): PetWindowRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function containsPoint(rect: PetWindowRect, point: PetWindowPoint) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * The screen rects of one pet that answer a pointer — body, agent-channel
 * bubble, resize handle — as `classifyPetWindowPoint` classifies them. Anything
 * else in a pet's frame is transparent and belongs to whatever is underneath.
 */
export function petOverlayHitRects(frame: PetWindowFrame): PetWindowRect[] {
  const rect = petOverlayFrameRect(frame);
  const drawScale = rect.width / PET_CELL_SIZE.width;
  const rects: PetWindowRect[] = [];

  for (const layoutRect of [
    PET_WINDOW_LAYOUT.body,
    frame.overlay ? PET_WINDOW_LAYOUT.overlay : null,
    PET_WINDOW_LAYOUT.resize,
  ]) {
    if (!layoutRect) {
      continue;
    }

    rects.push({
      x: rect.x + layoutRect.x * drawScale,
      y: rect.y + layoutRect.y * drawScale,
      width: layoutRect.width * drawScale,
      height: layoutRect.height * drawScale,
    });
  }

  return rects;
}

/**
 * How far outside a pet the cursor may stray before the overlay hands the mouse
 * back to the desktop. Only the *release* threshold is generous: see
 * `isPetOverlayInteractive`.
 */
export const PET_OVERLAY_RELEASE_MARGIN = 24;

/**
 * Whether the overlay window should be taking the mouse, given where the cursor
 * is now and whether it was taking it a moment ago.
 *
 * The single window covers the whole desktop, so "interactive" and
 * "click-through" are the same switch for every pixel of it — while it is
 * interactive it swallows clicks meant for whatever is underneath. That makes
 * the cost of the two mistakes wildly asymmetric: arming late loses one click
 * on a pet, arming early loses clicks on the user's editor. So it arms on the
 * *exact* pet rects and only releases once the cursor is clear of them by a
 * margin. The hysteresis is what stops the switch flapping on the boundary,
 * where a pet walking under a still cursor would otherwise toggle it every tick.
 */
export function isPetOverlayInteractive(
  frames: readonly PetWindowFrame[],
  cursor: PetWindowPoint | null,
  wasInteractive: boolean,
): boolean {
  if (!cursor) {
    return false;
  }

  const margin = wasInteractive ? PET_OVERLAY_RELEASE_MARGIN : 0;

  for (const frame of frames) {
    for (const rect of petOverlayHitRects(frame)) {
      if (containsPoint(inflate(rect, margin), cursor)) {
        return true;
      }
    }
  }

  return false;
}
