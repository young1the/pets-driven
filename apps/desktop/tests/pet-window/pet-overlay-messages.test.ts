import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { describe, expect, it } from "vitest";
import {
  isPetOverlayInteractive,
  PET_OVERLAY_RELEASE_MARGIN,
  petOverlayFrameOffset,
  petOverlayFrameRect,
  petOverlayHitRects,
  petOverlayWindowRect,
} from "@/pet-window/pet-overlay-messages";
import { PET_WINDOW_BUBBLE_OVERHEAD, PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import type { PetWindowFrame } from "@/pet-window/pet-window-messages";

const FULL_WINDOW = {
  width: PET_CELL_SIZE.width,
  height: PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD,
};

function frameFixture(overrides: Partial<PetWindowFrame> = {}): PetWindowFrame {
  return {
    schemaVersion: 1,
    sequence: 1,
    petId: "pet-a",
    window: { x: 400, y: 300, ...FULL_WINDOW },
    sprite: { animationState: "idle" },
    overlay: null,
    ...overrides,
  };
}

describe("petOverlayWindowRect", () => {
  it("leaves room on every side for a pet standing at the edge of the world", () => {
    const rect = petOverlayWindowRect({ x: 0, y: 0, width: 1920, height: 1080 });

    expect(rect.x).toBeLessThan(0);
    expect(rect.y).toBeLessThan(0);
    expect(rect.x + rect.width).toBeGreaterThan(1920);
    expect(rect.y + rect.height).toBeGreaterThan(1080);
  });

  it("keeps the world centred in the window it opens", () => {
    const bounds = { x: -1920, y: 0, width: 3840, height: 1080 };
    const rect = petOverlayWindowRect(bounds);

    expect(rect.x + rect.width / 2).toBe(bounds.x + bounds.width / 2);
    expect(rect.y + rect.height / 2).toBe(bounds.y + bounds.height / 2);
  });
});

describe("petOverlayFrameRect", () => {
  it("is the frame's own rect when the pet fills its window", () => {
    expect(petOverlayFrameRect(frameFixture())).toEqual({
      x: 400,
      y: 300,
      ...FULL_WINDOW,
    });
  });

  it("undoes the fixed window's centring for a pet drawn smaller than it", () => {
    const half = frameFixture({
      window: {
        x: 400,
        y: 300,
        width: FULL_WINDOW.width / 2,
        height: FULL_WINDOW.height / 2,
      },
    });
    const rect = petOverlayFrameRect(half);

    // Same centre as the 192x268 window the other mode would have placed, so a
    // pet does not move when the user switches modes.
    expect(rect.x + rect.width / 2).toBe(400 + FULL_WINDOW.width / 2);
    expect(rect.y + rect.height / 2).toBe(300 + FULL_WINDOW.height / 2);
  });
});

describe("petOverlayFrameOffset", () => {
  it("is the screen rect relative to the overlay window's corner", () => {
    const offset = petOverlayFrameOffset(frameFixture(), {
      x: 100,
      y: 50,
      width: 1920,
      height: 1080,
    });

    expect(offset).toEqual({ x: 300, y: 250, ...FULL_WINDOW });
  });
});

describe("petOverlayHitRects", () => {
  it("covers the body and the resize handle, and skips the bubble when there is none", () => {
    expect(petOverlayHitRects(frameFixture())).toEqual([
      {
        x: 400 + PET_WINDOW_LAYOUT.body.x,
        y: 300 + PET_WINDOW_LAYOUT.body.y,
        width: PET_WINDOW_LAYOUT.body.width,
        height: PET_WINDOW_LAYOUT.body.height,
      },
      {
        x: 400 + (PET_WINDOW_LAYOUT.resize?.x ?? 0),
        y: 300 + (PET_WINDOW_LAYOUT.resize?.y ?? 0),
        width: PET_WINDOW_LAYOUT.resize?.width ?? 0,
        height: PET_WINDOW_LAYOUT.resize?.height ?? 0,
      },
    ]);
  });

  it("adds the bubble once the pet has one to click", () => {
    const speaking = frameFixture({
      overlay: { kind: "agent-channel", status: "working", label: "Claude", message: "hi" },
    });

    expect(petOverlayHitRects(speaking)).toHaveLength(3);
  });

  it("scales every rect with the pet", () => {
    const half = frameFixture({
      window: {
        x: 0,
        y: 0,
        width: FULL_WINDOW.width / 2,
        height: FULL_WINDOW.height / 2,
      },
    });
    const [body] = petOverlayHitRects(half);

    expect(body.width).toBe(PET_WINDOW_LAYOUT.body.width / 2);
    expect(body.height).toBe(PET_WINDOW_LAYOUT.body.height / 2);
  });
});

describe("isPetOverlayInteractive", () => {
  const frames = [frameFixture()];
  const [body] = petOverlayHitRects(frames[0]);
  const onTheBody = { x: body.x + 1, y: body.y + 1 };
  const justOutside = { x: body.x - 4, y: body.y - 4 };

  it("stays click-through with no cursor to place", () => {
    expect(isPetOverlayInteractive(frames, null, false)).toBe(false);
    expect(isPetOverlayInteractive(frames, null, true)).toBe(false);
  });

  it("stays click-through for a cursor that is not on a pet", () => {
    expect(isPetOverlayInteractive(frames, { x: 0, y: 0 }, false)).toBe(false);
  });

  it("takes the mouse once the cursor is on a pet", () => {
    expect(isPetOverlayInteractive(frames, onTheBody, false)).toBe(true);
  });

  it("arms on the exact pet, so a click beside one is never swallowed", () => {
    expect(isPetOverlayInteractive(frames, justOutside, false)).toBe(false);
  });

  it("holds on until the cursor is clear of the pet by the release margin", () => {
    expect(isPetOverlayInteractive(frames, justOutside, true)).toBe(true);
    expect(
      isPetOverlayInteractive(
        frames,
        { x: body.x - PET_OVERLAY_RELEASE_MARGIN - 1, y: body.y },
        true,
      ),
    ).toBe(false);
  });

  it("has nothing to take the mouse for when every pet has gone home", () => {
    expect(isPetOverlayInteractive([], onTheBody, true)).toBe(false);
  });
});
