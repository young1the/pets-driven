import { describe, expect, it } from "vitest";
import { getAtlasFrame } from "@pets-driven/pet-engine/pets/assets/pet-atlas";

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

  it("selects directional running rows directly from animation state", () => {
    expect(getAtlasFrame("running-right", 0)).toMatchObject({
      rowIndex: 1,
      sourceY: 208,
    });
    expect(getAtlasFrame("running-left", 0)).toMatchObject({
      rowIndex: 2,
      sourceY: 416,
    });
  });
});
