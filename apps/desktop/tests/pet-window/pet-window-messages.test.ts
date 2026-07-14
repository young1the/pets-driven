import { describe, expect, it } from "vitest";
import {
  isFreshPetWindowMessage,
  isSamePetWindowPresentation,
  PET_WINDOW_FRAME_EVENT,
  PET_WINDOW_INPUT_EVENT,
  type PetWindowFrame,
} from "@/pet-window/pet-window-messages";

describe("pet window message contract", () => {
  it("uses versioned event names for the Pet Window boundary", () => {
    expect(PET_WINDOW_FRAME_EVENT).toBe("pet-window:frame:v1");
    expect(PET_WINDOW_INPUT_EVENT).toBe("pet-window:input:v1");
  });

  it("keeps Pet Window frames to routing, window, sprite presentation, and overlay only", () => {
    const frame: PetWindowFrame = {
      schemaVersion: 1,
      sequence: 4,
      petId: "pet-a",
      window: { x: 100, y: 200, width: 192, height: 208 },
      sprite: {
        decisionEmote: { emote: "sparkle", label: "Jump request", mood: "excited", tone: "spark" },
        animationState: "waiting",
      },
      overlay: { kind: "attention", label: "WAIT" },
    };

    expect(Object.keys(frame)).toEqual([
      "schemaVersion",
      "sequence",
      "petId",
      "window",
      "sprite",
      "overlay",
    ]);
  });

  it("treats equal or older sequence numbers as stale", () => {
    expect(isFreshPetWindowMessage(3, 4)).toBe(true);
    expect(isFreshPetWindowMessage(4, 4)).toBe(false);
    expect(isFreshPetWindowMessage(5, 4)).toBe(false);
  });

  it("compares presentation payloads without using sequence metadata", () => {
    expect(
      isSamePetWindowPresentation(
        {
          sprite: {
            decisionEmote: {
              emote: "sparkle",
              label: "Jump request",
              mood: "excited",
              tone: "spark",
            },
            animationState: "running-left",
          },
          overlay: { kind: "status", label: "!" },
        },
        {
          sprite: {
            decisionEmote: {
              emote: "sparkle",
              label: "Jump request",
              mood: "excited",
              tone: "spark",
            },
            animationState: "running-left",
          },
          overlay: { kind: "status", label: "!" },
        },
      ),
    ).toBe(true);

    expect(
      isSamePetWindowPresentation(
        { sprite: { decisionEmote: null, animationState: "idle" }, overlay: null },
        { sprite: { decisionEmote: null, animationState: "waiting" }, overlay: null },
      ),
    ).toBe(false);

    expect(
      isSamePetWindowPresentation(
        { sprite: { decisionEmote: null, animationState: "idle" }, overlay: null },
        {
          sprite: {
            decisionEmote: {
              emote: "heart",
              label: "Approaching pet",
              mood: "love",
              tone: "affection",
            },
            animationState: "idle",
          },
          overlay: null,
        },
      ),
    ).toBe(false);
  });
});
