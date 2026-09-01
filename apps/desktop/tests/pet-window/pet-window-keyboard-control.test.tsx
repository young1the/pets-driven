import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PetWindowInputEvent } from "@/pet-window/pet-window-messages";
import { usePetWindowKeyboardControl } from "@/pet-window/use-pet-window-keyboard-control";

const blurHandlers: (() => void)[] = [];
const sendInput = vi.fn();

// A real (non-preview) window: the point of the hook is what it puts on the
// wire, so the transport is the surface under test.
vi.mock("@/pet-window/pet-window-transport", () => ({
  petWindowTransport: {
    isDesktopRuntime: () => true,
    windowLabel: () => "pet-window-pet-a",
    subscribeWindowBlur: (handler: () => void) => {
      blurHandlers.push(handler);
      return Promise.resolve(() => {});
    },
    sendInput: (payload: PetWindowInputEvent) => {
      sendInput(payload);
      return Promise.resolve();
    },
  },
}));

function KeyboardControlHarness({ petId = "pet-a" }: { petId?: string }) {
  usePetWindowKeyboardControl(petId);

  return null;
}

function sentKinds() {
  return sendInput.mock.calls.map((call) => {
    const payload = call[0] as PetWindowInputEvent;

    return [payload.kind, payload.code];
  });
}

describe("pet window keyboard control", () => {
  beforeEach(() => {
    blurHandlers.length = 0;
    sendInput.mockClear();
  });

  it("relays a control key press and release to the host", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyD", key: "d" });
    fireEvent.keyUp(window, { code: "KeyD", key: "d" });

    expect(sendInput).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "body.key.down",
        code: "KeyD",
        key: "d",
        petId: "pet-a",
        windowLabel: "pet-window-pet-a",
      }),
    );
    expect(sendInput).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: "body.key.up", code: "KeyD" }),
    );
  });

  it("steers by physical key, so the arrow cluster and AD are the same keys", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
    fireEvent.keyDown(window, { code: "KeyD", key: "d" });

    expect(sentKinds()).toEqual([
      ["body.key.down", "ArrowLeft"],
      ["body.key.down", "KeyD"],
    ]);
  });

  it("leaves the vertical keys alone, since steering is along the floor", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyW", key: "w" });
    fireEvent.keyDown(window, { code: "ArrowUp", key: "ArrowUp" });
    fireEvent.keyDown(window, { code: "ArrowDown", key: "ArrowDown" });

    // Space is the only way off the ground, so these are somebody else's keys
    // now — the surface scrolls with them like any other page.
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("leaves every other key to whatever else the window is doing", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyF", key: "f" });
    fireEvent.keyDown(window, { code: "Tab", key: "Tab" });

    expect(sendInput).not.toHaveBeenCalled();
  });

  it("relays the jump as a single press with no release", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.keyUp(window, { code: "Space", key: " " });

    // One jump per press: the engine turns the edge into a jump request and
    // owns everything after it, so there is no key-up for the host to read.
    expect(sentKinds()).toEqual([["body.key.down", "Space"]]);
  });

  it("does not repeat the jump while space is held down", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.keyDown(window, { code: "Space", key: " ", repeat: true });
    fireEvent.keyDown(window, { code: "Space", key: " ", repeat: true });

    expect(sentKinds()).toEqual([["body.key.down", "Space"]]);
  });

  it("sends the press once, however long the key is held down", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyA", key: "a" });
    fireEvent.keyDown(window, { code: "KeyA", key: "a", repeat: true });
    fireEvent.keyDown(window, { code: "KeyA", key: "a", repeat: true });

    expect(sentKinds()).toEqual([["body.key.down", "KeyA"]]);
  });

  it("lets the pet go when the window loses focus", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyA", key: "a" });
    fireEvent.blur(window);

    expect(sentKinds()).toEqual([
      ["body.key.down", "KeyA"],
      ["body.key.blur", undefined],
    ]);

    // The key-up the unfocused window never hears must not release it twice.
    fireEvent.keyUp(window, { code: "KeyA", key: "a" });

    expect(sentKinds()).toHaveLength(2);
  });

  it("lets the pet go on a click away even with no key held", () => {
    render(<KeyboardControlHarness />);

    fireEvent.blur(window);

    // A pet standing still is still the user's until this is sent — clicking
    // away is the ordinary way of handing it back, and the common case is that
    // nothing was being held at the time.
    expect(sentKinds()).toEqual([["body.key.blur", undefined]]);
  });

  it("lets the pet go when the user presses escape, without leaving the window", () => {
    render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyD", key: "d" });
    fireEvent.keyDown(window, { code: "Escape", key: "Escape" });

    // Sent as the key it is: the engine reads Escape as "release whoever is
    // held", which a blur — scoped to this window's own pet — does not mean.
    expect(sentKinds()).toEqual([
      ["body.key.down", "KeyD"],
      ["body.key.down", "Escape"],
    ]);
  });

  it("lets the pet go when the pet's window goes away", () => {
    const { unmount } = render(<KeyboardControlHarness />);

    fireEvent.keyDown(window, { code: "KeyD", key: "d" });
    unmount();

    expect(sentKinds()).toEqual([
      ["body.key.down", "KeyD"],
      ["body.key.blur", undefined],
    ]);
  });

  it("also releases on the host's own blur signal, which a webview can miss", async () => {
    render(<KeyboardControlHarness />);
    await Promise.resolve();

    fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" });
    for (const handler of blurHandlers) {
      handler();
    }

    expect(sentKinds()).toEqual([
      ["body.key.down", "ArrowRight"],
      ["body.key.blur", undefined],
    ]);
  });
});
