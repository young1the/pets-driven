import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import type { PetWindowFrame } from "@/pet-window/pet-window-messages";
import { PetWindowView } from "@/pet-window/pet-window-view";
import { NOTE_IDLE_INTERVAL_MS } from "@/pet-window/use-pet-window-note";

/**
 * The note is the one line a pet window says on its own, so Quiet Mode cannot
 * reach it the way it reaches everything else — the engine has already fallen
 * silent by the time the frame is built. The level rides the frame instead, and
 * this is what checks the window listens to it.
 */

const frameHandlers: ((frame: PetWindowFrame) => void)[] = [];

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

const NOTE = "Rebase before the demo.";

function frame(sequence: number, note: string, quiet: boolean): PetWindowFrame {
  return {
    schemaVersion: 1,
    sequence,
    petId: "pet-a",
    name: "Otto",
    note,
    quiet,
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

async function openPetWindow() {
  render(<PetWindowView pet={{ petId: "pet-a", assetId: "bloop", windowIndex: 1 }} />);
  await waitFor(() => expect(frameHandlers.length).toBe(1));
}

describe("a pet's note under Quiet Mode", () => {
  beforeEach(() => {
    frameHandlers.length = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the idle recital to itself while the pets are quiet", async () => {
    await openPetWindow();
    await emit(frame(1, NOTE, true));

    act(() => vi.advanceTimersByTime(NOTE_IDLE_INTERVAL_MS));

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("recites it again as soon as the mode goes off", async () => {
    await openPetWindow();
    await emit(frame(1, NOTE, true));
    await emit(frame(2, NOTE, false));

    act(() => vi.advanceTimersByTime(NOTE_IDLE_INTERVAL_MS));

    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("still says a note the user has just saved — the save's only feedback", async () => {
    await openPetWindow();
    await emit(frame(1, NOTE, true));
    await emit(frame(2, "Ship the installer.", true));

    expect(screen.getByText("Ship the installer.")).toBeInTheDocument();
  });
});
