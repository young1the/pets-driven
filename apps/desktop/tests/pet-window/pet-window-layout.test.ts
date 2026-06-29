import { describe, expect, it } from "vitest";
import {
  clampPetWindowScale,
  petWindowSizeForScale,
} from "@/pet-window/pet-window-layout";

describe("pet window layout", () => {
  it("scales the full window height with the sprite scale", () => {
    const scale = 250.88 / 192;

    expect(clampPetWindowScale(scale)).toBe(scale);
    expect(petWindowSizeForScale(scale)).toEqual({
      width: 250.88,
      height: 350.18666666666667,
    });
  });
});
