import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PetOverlayFrame } from "@/pet-window/pet-overlay-messages";
import { PetOverlaySurface } from "@/pet-window/pet-overlay-surface";
import { PET_WINDOW_LAYOUT } from "@/pet-window/pet-window-layout";
import type { PetWindowFrame } from "@/pet-window/pet-window-messages";

const overlayHandlers: ((frame: PetOverlayFrame) => void)[] = [];
const sendInput = vi.fn();

vi.mock("@/pet-window/pet-window-transport", () => ({
  petWindowTransport: {
    isDesktopRuntime: () => true,
    windowLabel: () => "pet-overlay",
    subscribeFrame: () => Promise.resolve(() => {}),
    subscribeOverlayFrame: (handler: (frame: PetOverlayFrame) => void) => {
      overlayHandlers.push(handler);
      return Promise.resolve(() => {});
    },
    subscribeBinding: () => Promise.resolve(() => {}),
    subscribeWindowFocus: () => Promise.resolve(() => {}),
    subscribeWindowBlur: () => Promise.resolve(() => {}),
    sendInput: (payload: unknown) => {
      sendInput(payload);
      return Promise.resolve();
    },
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

function petFrame(petId: string, x: number, name: string, sequence = 1): PetWindowFrame {
  return {
    schemaVersion: 1,
    // The host stamps every pet's frame with the tick that produced it, so a
    // pet's own sequence climbs with the overlay's.
    sequence,
    petId,
    name,
    assetId: "cato",
    window: { x, y: 200, width: PET_WINDOW_LAYOUT.width, height: PET_WINDOW_LAYOUT.height },
    sprite: { animationState: "idle" },
    overlay: null,
  };
}

async function emit(sequence: number, pets: PetWindowFrame[]) {
  await act(async () => {
    for (const handler of overlayHandlers) {
      handler({
        schemaVersion: 1,
        sequence,
        bounds: { x: 100, y: 100, width: 1920, height: 1080 },
        pets,
      });
    }
  });
}

function petBoxes() {
  return Array.from(document.querySelectorAll<HTMLElement>(".pet-overlay-pet"));
}

describe("PetOverlaySurface", () => {
  beforeEach(() => {
    overlayHandlers.length = 0;
    sendInput.mockClear();
    document.body.innerHTML = "";
  });

  it("draws every pet the frame carries, at its own place in the window", async () => {
    render(<PetOverlaySurface />);
    await waitFor(() => expect(overlayHandlers.length).toBeGreaterThan(0));

    await emit(1, [petFrame("pet-a", 400, "Otto"), petFrame("pet-b", 900, "Cato")]);

    await waitFor(() => expect(petBoxes()).toHaveLength(2));
    expect(await screen.findByText("Otto")).toBeInTheDocument();
    expect(await screen.findByText("Cato")).toBeInTheDocument();
    // Screen position minus the overlay window's own corner.
    expect(petBoxes()[0].style.transform).toBe("translate3d(300px, 100px, 0)");
    expect(petBoxes()[1].style.transform).toBe("translate3d(800px, 100px, 0)");
  });

  it("moves a pet without re-rendering the roster", async () => {
    render(<PetOverlaySurface />);
    await waitFor(() => expect(overlayHandlers.length).toBeGreaterThan(0));

    await emit(1, [petFrame("pet-a", 400, "Otto")]);
    await waitFor(() => expect(petBoxes()).toHaveLength(1));
    const [box] = petBoxes();

    await emit(2, [petFrame("pet-a", 500, "Otto")]);

    expect(petBoxes()[0]).toBe(box);
    expect(box.style.transform).toBe("translate3d(400px, 100px, 0)");
  });

  it("drops a pet the frame no longer carries", async () => {
    render(<PetOverlaySurface />);
    await waitFor(() => expect(overlayHandlers.length).toBeGreaterThan(0));

    await emit(1, [petFrame("pet-a", 400, "Otto"), petFrame("pet-b", 900, "Cato")]);
    await waitFor(() => expect(petBoxes()).toHaveLength(2));

    await emit(2, [petFrame("pet-a", 400, "Otto")]);

    await waitFor(() => expect(petBoxes()).toHaveLength(1));
    expect(screen.queryByText("Cato")).not.toBeInTheDocument();
  });

  it("answers the pointer only where the pet actually is", async () => {
    render(<PetOverlaySurface />);
    await waitFor(() => expect(overlayHandlers.length).toBeGreaterThan(0));

    await emit(1, [petFrame("pet-a", 400, "Otto")]);
    await waitFor(() => expect(petBoxes()).toHaveLength(1));

    // The surface itself takes nothing: the empty margin around one pet has to
    // stay clickable for the pet standing behind it.
    expect(document.querySelector(".pet-window-surface--shared")).not.toBeNull();
    // The body and the resize handle; the bubble joins them when there is one.
    expect(document.querySelectorAll(".pet-window-hit-shim")).toHaveLength(2);

    await emit(2, [
      {
        ...petFrame("pet-a", 400, "Otto", 2),
        overlay: { kind: "agent-channel", status: "working", label: "Claude", message: "hi" },
      },
    ]);

    await waitFor(() => expect(document.querySelectorAll(".pet-window-hit-shim")).toHaveLength(3));
  });

  it("ignores a frame that is older than the one it has drawn", async () => {
    render(<PetOverlaySurface />);
    await waitFor(() => expect(overlayHandlers.length).toBeGreaterThan(0));

    await emit(5, [petFrame("pet-a", 400, "Otto")]);
    await waitFor(() => expect(petBoxes()).toHaveLength(1));

    await emit(4, [petFrame("pet-a", 900, "Otto")]);

    expect(petBoxes()[0].style.transform).toBe("translate3d(300px, 100px, 0)");
  });
});
