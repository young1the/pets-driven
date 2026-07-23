import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import type { PetWindowFrame } from "@/pet-window/pet-window-messages";
import { PetWindowView } from "@/pet-window/pet-window-view";

const frameHandlers: ((frame: PetWindowFrame) => void)[] = [];

// A real (non-preview) window, so the frame stream is what drives it — the whole
// point of the case: an overlay window renders, it never simulates.
vi.mock("@/pet-window/pet-window-transport", () => ({
  petWindowTransport: {
    isDesktopRuntime: () => true,
    windowLabel: () => "pet-window-pet-a",
    subscribeFrame: (handler: (frame: PetWindowFrame) => void) => {
      frameHandlers.push(handler);
      return Promise.resolve(() => {});
    },
    subscribeBinding: () => Promise.resolve(() => {}),
    subscribeWindowFocus: () => Promise.resolve(() => {}),
    subscribeWindowBlur: () => Promise.resolve(() => {}),
    sendInput: vi.fn(),
    sendResize: vi.fn(),
    setWindowSize: () => Promise.resolve(),
    showWindow: () => Promise.resolve(),
    focusWindow: () => Promise.resolve(),
    hideWindow: () => Promise.resolve(),
    startDragging: () => Promise.resolve(),
    setIgnoreCursorEvents: () => Promise.resolve(),
  },
}));

vi.mock("@/pet-window/pet-window-spritesheet", () => ({
  loadPetWindowSpritesheetUrl: (assetId: string) =>
    Promise.resolve({ url: `blob:${assetId}`, dispose: () => {} }),
}));

function frame(sequence: number, assetId?: string): PetWindowFrame {
  return {
    schemaVersion: 1,
    sequence,
    petId: "pet-a",
    name: "Otto",
    assetId,
    window: { x: 0, y: 0, width: PET_WINDOW_LAYOUT.width, height: PET_WINDOW_LAYOUT.height },
    sprite: { animationState: "idle" },
    overlay: null,
  };
}

async function emit(next: PetWindowFrame) {
  await act(async () => {
    for (const handler of frameHandlers) {
      handler(next);
    }
  });
}

/** The asset id behind the sprite's spritesheet URL (`blob:<assetId>` here). */
function shownAssetId() {
  const background = screen.getByLabelText("Pet Sprite pet-a").style.backgroundImage;

  return background.match(/blob:([\w-]+)/)?.[1] ?? null;
}

describe("pet window asset swap", () => {
  beforeEach(() => {
    frameHandlers.length = 0;
  });

  it("starts from the asset id its URL was opened with", async () => {
    render(<PetWindowView pet={{ petId: "pet-a", assetId: "bloop", windowIndex: 1 }} />);

    await waitFor(() => expect(shownAssetId()).toBe("bloop"));
  });

  it("re-skins in place when the host frame carries a new asset id", async () => {
    render(<PetWindowView pet={{ petId: "pet-a", assetId: "bloop", windowIndex: 1 }} />);
    await waitFor(() => expect(frameHandlers.length).toBe(1));

    await emit(frame(1, "cato"));

    // The window's URL still says "bloop"; the live frame wins.
    await waitFor(() => expect(shownAssetId()).toBe("cato"));
  });

  it("keeps the last known asset when a frame omits it", async () => {
    render(<PetWindowView pet={{ petId: "pet-a", assetId: "bloop", windowIndex: 1 }} />);
    await waitFor(() => expect(frameHandlers.length).toBe(1));

    await emit(frame(1, "cato"));
    await waitFor(() => expect(shownAssetId()).toBe("cato"));

    await emit(frame(2));

    expect(shownAssetId()).toBe("cato");
  });
});
