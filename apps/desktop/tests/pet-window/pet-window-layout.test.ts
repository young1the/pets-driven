import { describe, expect, it } from "vitest";
import {
  DEFAULT_PET_WINDOW_SCALE,
  PET_WINDOW_MIN_SCALE,
  clampPetWindowScale,
  petWindowSizeForScale,
} from "@/pet-window/pet-window-layout";

describe("pet window layout", () => {
  it("spawns newly created pets at the smallest size the app allows", () => {
    expect(DEFAULT_PET_WINDOW_SCALE).toBe(PET_WINDOW_MIN_SCALE);
    expect(petWindowSizeForScale(DEFAULT_PET_WINDOW_SCALE)).toEqual({
      width: 96,
      height: 134,
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
