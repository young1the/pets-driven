import { describe, expect, it } from "vitest";
import {
  isFreshPetWindowMessage,
  PET_WINDOW_INPUT_EVENT,
  PET_WINDOW_POSITION_EVENT,
  PET_WINDOW_PRESENTATION_EVENT,
  type PetWindowPresentationUpdate,
} from "@/pet-window/pet-window-messages";

describe("pet window message contract", () => {
  it("uses versioned event names for the Pet Window boundary", () => {
    expect(PET_WINDOW_POSITION_EVENT).toBe("pet-window:position:v1");
    expect(PET_WINDOW_PRESENTATION_EVENT).toBe("pet-window:presentation:v1");
    expect(PET_WINDOW_INPUT_EVENT).toBe("pet-window:input:v1");
  });

  it("keeps presentation updates to intent and overlay only", () => {
    const update: PetWindowPresentationUpdate = {
      sequence: 4,
      intent: { kind: "waiting", facing: "right" },
      overlay: { kind: "attention", label: "WAIT" },
    };

    expect(Object.keys(update)).toEqual(["sequence", "intent", "overlay"]);
  });

  it("treats equal or older sequence numbers as stale", () => {
    expect(isFreshPetWindowMessage(3, 4)).toBe(true);
    expect(isFreshPetWindowMessage(4, 4)).toBe(false);
    expect(isFreshPetWindowMessage(5, 4)).toBe(false);
  });
});
