import { describe, expect, it } from "vitest";
import { getAtlasFrame } from "@/pets/assets/pet-atlas";

describe("pet atlas", () => {
  it("selects frames using the fixed hatch-pet row layout", () => {
    expect(getAtlasFrame("idle", 0)).toEqual({
      frameIndex: 0,
      rowIndex: 0,
      sourceX: 0,
      sourceY: 0,
    });

    expect(getAtlasFrame("waiting", 320)).toEqual({
      frameIndex: 2,
      rowIndex: 6,
      sourceX: 384,
      sourceY: 1248,
    });
  });
});
