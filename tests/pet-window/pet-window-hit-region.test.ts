import { describe, expect, it } from "vitest";
import { classifyPetWindowPoint } from "@/pet-window/pet-window-hit-region";

describe("pet window hit region", () => {
  const layout = {
    width: 192,
    height: 208,
    body: { x: 42, y: 46, width: 108, height: 132 },
    overlay: { x: 54, y: 12, width: 84, height: 28 },
  };

  it("classifies body points as direct manipulation starts", () => {
    expect(classifyPetWindowPoint(layout, { x: 96, y: 112 })).toEqual({
      kind: "body",
      startsDirectManipulation: true,
    });
  });

  it("classifies overlay points as action-only", () => {
    expect(classifyPetWindowPoint(layout, { x: 96, y: 20 })).toEqual({
      kind: "overlay",
      startsDirectManipulation: false,
    });
  });

  it("lets transparent points pass through", () => {
    expect(classifyPetWindowPoint(layout, { x: 8, y: 8 })).toEqual({
      kind: "transparent",
      startsDirectManipulation: false,
    });
  });

  it("keeps overlay masks action-only when they overlap body masks", () => {
    expect(
      classifyPetWindowPoint(
        {
          ...layout,
          overlay: { x: 78, y: 78, width: 36, height: 36 },
        },
        { x: 96, y: 96 },
      ),
    ).toEqual({
      kind: "overlay",
      startsDirectManipulation: false,
    });
  });
});
