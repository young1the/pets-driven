import { describe, expect, it } from "vitest";
import {
  getAtlasFrame,
  msUntilNextAtlasFrame,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";

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

  it("reports the exact delay until the atlas flips frames", () => {
    // idle durations: [280, 110, 110, 140, 140, 320], loop = 1100
    expect(msUntilNextAtlasFrame("idle", 0)).toBe(280);
    expect(msUntilNextAtlasFrame("idle", 279)).toBe(1);
    expect(msUntilNextAtlasFrame("idle", 280)).toBe(110);
    expect(msUntilNextAtlasFrame("idle", 1100)).toBe(280);
  });

  it("stays on the same frame until the reported delay elapses", () => {
    const elapsedMs = 137;
    const delay = msUntilNextAtlasFrame("waiting", elapsedMs);

    expect(getAtlasFrame("waiting", elapsedMs + delay - 1).frameIndex).toBe(
      getAtlasFrame("waiting", elapsedMs).frameIndex,
    );
    expect(getAtlasFrame("waiting", elapsedMs + delay).frameIndex).not.toBe(
      getAtlasFrame("waiting", elapsedMs).frameIndex,
    );
  });
});
