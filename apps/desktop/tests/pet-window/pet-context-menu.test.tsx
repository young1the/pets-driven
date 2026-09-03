import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { MENU_WINDOW_SIZE, PetContextMenuView } from "@/pet-window/pet-context-menu-view";
import { petWindowTransport } from "@/pet-window/pet-window-transport";

// Browser-preview mode (isTauri() === false): every window call is a no-op, so
// the menu renders without a real popup behind it.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  LogicalSize: class {},
  LogicalPosition: class {},
}));

function renderMenu(gameSpawn: "auto" | "tool-use" | null = null) {
  return render(<PetContextMenuView petId="pet-a" petName="Scout" note="" gameSpawn={gameSpawn} />);
}

type SendInputSpy = MockInstance<typeof petWindowTransport.sendInput>;

function emittedKinds(spy: SendInputSpy) {
  return spy.mock.calls.map(([payload]) => payload.kind);
}

describe("the pet context menu", () => {
  let sendInput: SendInputSpy;

  beforeEach(() => {
    sendInput = vi.spyOn(petWindowTransport, "sendInput").mockResolvedValue(undefined);
  });

  it("spends one row on the whole game feature, not two", () => {
    renderMenu();

    // Two rows for one feature is what made a six-row menu, and they read
    // almost the same.
    expect(screen.getByRole("menuitem", { name: /Game mode/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Practice run/ })).toBeNull();
  });

  it("opens the two kinds of round behind that row", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /Game mode/ }));

    expect(screen.getByRole("menuitem", { name: /Watch the agent/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Practice run/ })).toBeTruthy();
    // Opening a chooser is not itself an action: nothing is asked of the host
    // until one of the two is picked.
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("says what each kind of round actually is", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /Game mode/ }));

    // One is a reading of the agent and the other is a game. Neither name says
    // so on its own, and this is the screen with room to.
    expect(screen.getByRole("menuitem", { name: /Its tool calls are the obstacles/ })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /A steady course you play yourself/ }),
    ).toBeTruthy();
  });

  it("never resizes the window between menu views", () => {
    const setWindowSize = vi.spyOn(petWindowTransport, "setWindowSize").mockResolvedValue();
    renderMenu();
    const onOpen = setWindowSize.mock.calls.at(-1);

    fireEvent.click(screen.getByRole("menuitem", { name: /Game mode/ }));

    // The popup is placed once, in Rust, and the edge clamp there measures
    // against one size — nothing re-clamps a window the view grew afterwards.
    // So a size per view is a menu that jumps when you step into it.
    expect(setWindowSize.mock.calls.at(-1)).toEqual(onOpen);
  });

  it("asks for the course the picked row names", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Game mode/ }));

    fireEvent.click(screen.getByRole("menuitem", { name: /Practice run/ }));

    expect(emittedKinds(sendInput)).toEqual(["menu.game-practice"]);
  });

  it("leads back out to the top menu", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Game mode/ }));

    fireEvent.click(screen.getByRole("button", { name: /Game mode/ }));

    expect(screen.getByRole("menuitem", { name: /Write a note/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Watch the agent/ })).toBeNull();
  });

  it("stops a running round from the top menu rather than a step down", () => {
    renderMenu("auto");

    // The menu is the only off switch there is, and one a step down is one the
    // user has to go looking for.
    fireEvent.click(screen.getByRole("menuitem", { name: /Stop the round/ }));

    expect(emittedKinds(sendInput)).toEqual(["menu.game-stop"]);
  });

  it("stops a round whichever kind it is", () => {
    renderMenu("tool-use");

    fireEvent.click(screen.getByRole("menuitem", { name: /Stop the round/ }));

    // One signal for both kinds: a stop that had to name the kind it was
    // stopping would switch the course instead of ending it.
    expect(emittedKinds(sendInput)).toEqual(["menu.game-stop"]);
  });
});

describe("the size the popup is born at", () => {
  // Rust creates the window at its own copy of these numbers and clamps the
  // menu against them so one opened near an edge flips by its real size. The
  // two have drifted before — a row came off the menu and this was left behind
  // — and nothing on screen says when they have, so it is asserted rather than
  // left to a comment on each side.
  const rust = readFileSync(join(process.cwd(), "src-tauri", "src", "pet_windows.rs"), "utf8");

  function rustConstant(name: string) {
    return Number(new RegExp(`const ${name}: f64 = ([0-9.]+);`).exec(rust)?.[1]);
  }

  it("is the same on both sides of the app", () => {
    expect(rustConstant("MENU_WINDOW_WIDTH")).toBe(MENU_WINDOW_SIZE.width);
    expect(rustConstant("MENU_WINDOW_HEIGHT")).toBe(MENU_WINDOW_SIZE.height);
  });
});
