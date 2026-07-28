import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { describe, expect, it } from "vitest";
import { itemWindowRouteParams } from "@/pet-window/item-window-route";
import { ITEM_WINDOW_SIZE, projectWorldItemsToWindows } from "@/pet-window/pet-window-projection";

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
