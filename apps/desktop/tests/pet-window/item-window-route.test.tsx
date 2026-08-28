import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemWindowSurface, itemWindowRouteParams } from "@/pet-window/item-window-route";

const sendInput = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
  emitTo: () => Promise.resolve(),
}));

vi.mock("@/pet-window/pet-window-transport", () => ({
  petWindowTransport: {
    isDesktopRuntime: () => true,
    windowLabel: () => "item-window-prop-ball-0",
    sendInput: (payload: unknown) => {
      sendInput(payload);
      return Promise.resolve();
    },
  },
}));

/**
 * The overlay one non-pet entity gets. Its whole job on the prop side is to
 * hand the host a pointer in *screen* coordinates and say which entity it is
 * about — everything a drag actually is happens in the engine, hit-tested
 * against `CanDrag` by world position.
 */

beforeEach(() => {
  sendInput.mockClear();
});

describe("itemWindowRouteParams", () => {
  it("resolves both a trinket and a prop", () => {
    expect(itemWindowRouteParams("?surface=item-window&itemId=item-wings-0&kind=wings")).toEqual({
      itemId: "item-wings-0",
      kind: "wings",
    });
    expect(itemWindowRouteParams("?surface=item-window&itemId=prop-ball-0&kind=ball")).toEqual({
      itemId: "prop-ball-0",
      kind: "ball",
    });
  });

  it("refuses a kind the engine does not have", () => {
    expect(itemWindowRouteParams("?surface=item-window&itemId=x&kind=anvil")).toBeNull();
  });

  it("ignores a URL addressing another surface", () => {
    expect(itemWindowRouteParams("?surface=pet-window&petId=pet-a")).toBeNull();
  });
});

describe("ItemWindowSurface", () => {
  it("sends a prop's pointer gesture to the host in screen coordinates", () => {
    render(<ItemWindowSurface item={{ itemId: "prop-ball-0", kind: "ball" }} />);
    const surface = screen.getByRole("img");
    surface.getBoundingClientRect = () => new DOMRect(0, 0, 64, 64);

    fireEvent.pointerDown(surface, {
      pointerId: 3,
      clientX: 32,
      clientY: 32,
      screenX: 400,
      screenY: 500,
      button: 0,
    });
    fireEvent.pointerMove(surface, { pointerId: 3, screenX: 460, screenY: 480 });
    fireEvent.pointerUp(surface, { pointerId: 3, screenX: 520, screenY: 460 });

    expect(sendInput).toHaveBeenCalledTimes(3);
    expect(sendInput.mock.calls.map(([payload]) => payload.kind)).toEqual([
      "body.pointer.down",
      "body.pointer.move",
      "body.pointer.up",
    ]);
    expect(sendInput.mock.calls[0][0]).toMatchObject({
      petId: "prop-ball-0",
      // Without this the host looks the id up in the adopted pet roster, misses,
      // and routes the drag into the fixture world instead.
      entity: "prop",
      pointerId: 3,
      screenPoint: { x: 400, y: 500 },
    });
  });

  it("draws the ball as an image the browser will not drag out of the app", () => {
    // The regression: an image element is draggable by default, so grabbing the
    // ball started an image drag-out and the shell offered to download the
    // artwork instead of the toy moving. The attribute is the fix, and it is
    // one careless edit away from coming back — hence a test on it rather than
    // on the drawing, which the eye catches anyway.
    const { container } = render(
      <ItemWindowSurface item={{ itemId: "prop-ball-0", kind: "ball" }} />,
    );

    const art = container.querySelector<HTMLImageElement>(".item-window__art");
    expect(art?.src).toContain("data:image/svg+xml");
    expect(art?.draggable).toBe(false);
  });

  it("ignores a press on the square corners around the ball", () => {
    // The window is a 64px square holding a 52px ball. Deciding "on the ball"
    // here, in the window own coordinates, is the whole point of naming the
    // entity to the host: the exact answer is the one this file can give.
    render(<ItemWindowSurface item={{ itemId: "prop-ball-0", kind: "ball" }} />);
    const surface = screen.getByRole("img");
    surface.getBoundingClientRect = () => new DOMRect(0, 0, 64, 64);

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 2, clientY: 2 });

    expect(sendInput).not.toHaveBeenCalled();
  });

  it("leaves a trinket inert — it is scenery, not a target", () => {
    render(<ItemWindowSurface item={{ itemId: "item-wings-0", kind: "wings" }} />);

    fireEvent.pointerDown(screen.getByRole("img"), { pointerId: 1, screenX: 10, screenY: 10 });

    expect(sendInput).not.toHaveBeenCalled();
  });
});
