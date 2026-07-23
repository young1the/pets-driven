import { describe, expect, it } from "vitest";
import {
  FAN_CARD_HEIGHT,
  FAN_CARD_WIDTH,
  FAN_MIN_STEP_X,
  fanLayout,
  fanOffset,
  fanSpread,
  fanZIndex,
} from "@/app/main-window/home-fan-layout";

/** The main window is a fixed 1200x800 shell (see tauri.conf.json). */
const WINDOW_WIDTH = 1200;

/**
 * Where the outermost cards actually land, mirroring how home-section places
 * them: `left: calc(50% + offset * stepX)` with `translateX(-50%)` and a
 * rotation about `transform-origin: bottom center`, which swings a card's whole
 * height sideways rather than half of it.
 */
function fanEdges(count: number, containerWidth: number, cardHeight = FAN_CARD_HEIGHT) {
  const { stepX, rotationDeg } = fanLayout(count, containerWidth, cardHeight);
  const spread = fanSpread(count);
  const tiltRad = ((rotationDeg * spread) / 180) * Math.PI;
  const outward = (FAN_CARD_WIDTH / 2) * Math.cos(tiltRad) + cardHeight * Math.sin(tiltRad);

  return {
    left: containerWidth / 2 - spread * stepX - outward,
    right: containerWidth / 2 + spread * stepX + outward,
    stepX,
    rotationDeg,
  };
}

describe("fanSpread / fanOffset", () => {
  it("centers the fan on the middle of the row, not on a chosen card", () => {
    // An even count has no middle card, so both ends sit the same distance out
    // instead of the whole fan leaning to one side.
    expect(fanOffset(0, 2)).toBe(-0.5);
    expect(fanOffset(1, 2)).toBe(0.5);
    expect(fanOffset(0, 5)).toBe(-2);
    expect(fanOffset(4, 5)).toBe(2);
  });

  it("has no spread for an empty or single-card fan", () => {
    expect(fanSpread(0)).toBe(0);
    expect(fanSpread(1)).toBe(0);
  });
});

describe("fanLayout", () => {
  it("spreads freely while the fan is short", () => {
    expect(fanLayout(1, WINDOW_WIDTH).stepX).toBe(150);
    expect(fanLayout(3, WINDOW_WIDTH).stepX).toBe(150);
  });

  it("keeps the uncollapsed spread until the container has been measured", () => {
    // Width 0 is the first paint and any headless render; collapsing there
    // would make the fan pop open once the measurement arrives.
    expect(fanLayout(13, 0).stepX).toBe(150);
  });

  it("collapses step, tilt and drop together as cards are added", () => {
    const five = fanLayout(5, WINDOW_WIDTH);
    const thirteen = fanLayout(13, WINDOW_WIDTH);

    expect(thirteen.stepX).toBeLessThan(five.stepX);
    expect(thirteen.rotationDeg).toBeLessThan(five.rotationDeg);
    expect(thirteen.dropY).toBeLessThan(five.dropY);
  });

  it("bounds how far the ends of the fan may sink", () => {
    // The cards deliberately hang past the bottom of their container; what
    // used to be unbounded is the extra drop the outermost card adds.
    for (const count of [1, 2, 3, 5, 8, 13, 21, 29]) {
      const { dropY } = fanLayout(count, WINDOW_WIDTH);
      expect(fanSpread(count) * dropY).toBeLessThanOrEqual(60);
    }
  });

  it.each([1, 2, 3, 5, 8, 13, 16, 21, 29])("keeps %i cards inside the window", (count) => {
    const { left, right } = fanEdges(count, WINDOW_WIDTH);

    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(WINDOW_WIDTH);
  });

  it("keeps a card with a wrapped name inside the window too", () => {
    // A two-line pet name makes one card ~50px taller, and a tilted card
    // swings its full height sideways — assuming the short card put the ends
    // of the fan back off screen.
    const { left, right } = fanEdges(16, WINDOW_WIDTH, 360);

    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(WINDOW_WIDTH);
  });

  it("gives up the tilt rather than the click strip on a long fan", () => {
    const fanned = fanLayout(16, WINDOW_WIDTH);

    expect(fanned.rotationDeg).toBeGreaterThan(0);
    expect(fanned.stepX).toBeGreaterThan(FAN_MIN_STEP_X);

    // Long enough that a tilt would cost more width than the cards can spare:
    // the fan flattens, and every card keeps its strip.
    const flat = fanLayout(41, WINDOW_WIDTH);

    expect(flat.rotationDeg).toBe(0);
    expect(flat.stepX).toBeGreaterThanOrEqual(FAN_MIN_STEP_X);
    expect(fanEdges(41, WINDOW_WIDTH).left).toBeGreaterThanOrEqual(0);
  });

  it("leaves every card a clickable strip, however many there are", () => {
    // Each card is covered by its inner neighbour except for a strip one step
    // wide, so the step is the card's click target.
    for (const count of [2, 5, 13, 29, 60]) {
      expect(fanLayout(count, WINDOW_WIDTH).stepX).toBeGreaterThanOrEqual(FAN_MIN_STEP_X);
    }
  });
});

describe("fanZIndex", () => {
  it("stacks the middle of the fan above both ends", () => {
    expect(fanZIndex(0, 13)).toBeGreaterThan(fanZIndex(3, 13));
    expect(fanZIndex(3, 13)).toBeGreaterThan(fanZIndex(6, 13));
  });

  it("mirrors the two sides", () => {
    expect(fanZIndex(-4, 13)).toBe(fanZIndex(4, 13));
  });

  it("stays positive however long the fan is", () => {
    // A fixed per-card decrement used to run the ends to zero and below once
    // the roster passed twenty pets.
    for (const count of [13, 29, 60, 120]) {
      expect(fanZIndex(fanSpread(count), count)).toBeGreaterThan(0);
    }
  });
});
