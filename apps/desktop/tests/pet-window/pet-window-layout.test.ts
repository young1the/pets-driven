import { describe, expect, it } from "vitest";
import {
  DEFAULT_PET_WINDOW_SCALE,
  clampPetWindowScale,
  petWindowSizeForScale,
} from "@/pet-window/pet-window-layout";

describe("pet window layout", () => {
  it("uses a smaller default Pet Window scale for newly spawned pets", () => {
    expect(DEFAULT_PET_WINDOW_SCALE).toBe(0.8);
    expect(petWindowSizeForScale(DEFAULT_PET_WINDOW_SCALE)).toEqual({
      width: 153.60000000000002,
      height: 214.4,
    });
  });

  it("scales the full window height with the sprite scale", () => {
    const scale = 250.88 / 192;

    expect(clampPetWindowScale(scale)).toBe(scale);
    expect(petWindowSizeForScale(scale)).toEqual({
      width: 250.88,
      height: 350.18666666666667,
    });
  });
});
