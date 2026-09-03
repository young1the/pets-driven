import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { describe, expect, it } from "vitest";
import { itemWindowRouteParams } from "@/pet-window/item-window-route";
import {
  ITEM_WINDOW_SIZE,
  projectWorldItemsToWindows,
  projectWorldPropsToWindows,
} from "@/pet-window/pet-window-projection";

function snapshotWithItems(items: WorldSnapshot["items"]): WorldSnapshot {
  return {
    width: 1920,
    height: 1080,
    viewport: { x: 0, y: 0, width: 1920, height: 1080 },
    climbableSurfaces: [],
    bodies: [],
    pets: [],
    items,
  };
}

describe("trinket window projection", () => {
  it("centres the fixed overlay square on the trinket's world position", () => {
    const placements = projectWorldItemsToWindows(
      snapshotWithItems([
        { id: "item-wings-0", kind: "wings", position: { x: 600, y: 1064 }, expiresAt: 90_000 },
      ]),
      { x: 0, y: 0, width: 1920, height: 1080 },
    );

    expect(placements).toEqual([
      {
        itemId: "item-wings-0",
        kind: "wings",
        // A trinket is scenery a pet fetches, never something the user handles,
        // so its window hands the mouse back to the desktop behind it.
        grabbable: false,
        x: 600 - ITEM_WINDOW_SIZE / 2,
        y: 1064 - ITEM_WINDOW_SIZE / 2,
      },
    ]);
  });

  it("offsets by the virtual desktop origin so a second monitor lands correctly", () => {
    const snapshot = snapshotWithItems([
      { id: "item-claws-1", kind: "claws", position: { x: -640, y: 944 }, expiresAt: 90_000 },
    ]);
    snapshot.width = 3200;
    snapshot.viewport = { x: -1280, y: 0, width: 3200, height: 1080 };

    const [placement] = projectWorldItemsToWindows(snapshot, {
      x: -1280,
      y: 0,
      width: 3200,
      height: 1080,
    });

    expect(placement.x).toBe(-640 - ITEM_WINDOW_SIZE / 2);
    expect(placement.y).toBe(944 - ITEM_WINDOW_SIZE / 2);
  });

  it("reports nothing for a world that has no trinkets out", () => {
    expect(
      projectWorldItemsToWindows(snapshotWithItems(undefined), {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      }),
    ).toEqual([]);
  });
});

describe("trinket window route", () => {
  it("resolves a trinket overlay URL", () => {
    expect(itemWindowRouteParams("?surface=item-window&itemId=item-wings-0&kind=wings")).toEqual({
      itemId: "item-wings-0",
      kind: "wings",
    });
  });

  it("declines a URL addressing another surface", () => {
    expect(itemWindowRouteParams("?surface=pet-window&petId=pet-a&assetId=cato")).toBeNull();
  });

  it("declines a kind the engine does not define", () => {
    // The kind reaches the DOM as a glyph lookup, so an unknown one must not
    // route at all rather than render an undefined presentation.
    expect(itemWindowRouteParams("?surface=item-window&itemId=x&kind=boots")).toBeNull();
  });
});

describe("which overlays take the mouse", () => {
  // The shell used to answer this from its own list of grabbable kinds, beside
  // its own list of drawable ones. Both were copies of the engine's types with
  // nothing linking them, and the drawable one fell behind the moment a prop
  // kind was added: the obstacle kept its body and its collision and never got
  // a window. So the fact travels with the placement now, off the entity's own
  // CanDrag, and the shell keeps no list of kinds at all.
  function propPlacements(props: WorldSnapshot["props"]) {
    return projectWorldPropsToWindows(
      { ...snapshotWithItems([]), props },
      { x: 0, y: 0, width: 1920, height: 1080 },
    );
  }

  it("carries the ball's own answer, which is yes", () => {
    const [placement] = propPlacements([
      {
        id: "prop-ball",
        kind: "ball",
        position: { x: 100, y: 100 },
        radius: 14,
        angle: 0,
        grabbable: true,
      },
    ]);

    expect(placement.grabbable).toBe(true);
  });

  it("carries a hurdle's, which is no", () => {
    const [placement] = propPlacements([
      {
        id: "game-obstacle-hurdle-tall-1",
        kind: "hurdle-tall",
        position: { x: 100, y: 100 },
        radius: 13,
        angle: 0,
        grabbable: false,
      },
    ]);

    // Course scenery nobody is meant to walk over to: its clicks belong to
    // whatever is behind it on the desktop.
    expect(placement.grabbable).toBe(false);
    expect(placement.kind).toBe("hurdle-tall");
  });
});
