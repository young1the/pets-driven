import { describe, expect, it } from "vitest";
import {
  animationStateFromSpriteIntent,
  type PetSpriteIntent,
} from "@/pets/rendering/pet-sprite-intent";

describe("pet sprite rendering", () => {
  it("maps semantic travel and working intents to hatch-pet atlas states", () => {
    expect(animationStateFromSpriteIntent({ kind: "travel", direction: "right" })).toBe("running-right");
    expect(animationStateFromSpriteIntent({ kind: "travel", direction: "left" })).toBe("running-left");
    expect(animationStateFromSpriteIntent({ kind: "working" })).toBe("running");
  });

  it("maps direct status intents to matching hatch-pet atlas states", () => {
    const statuses: PetSpriteIntent[] = [
      { kind: "idle" },
      { kind: "waving" },
      { kind: "jumping" },
      { kind: "failed" },
      { kind: "waiting" },
      { kind: "review" },
    ];

    expect(statuses.map(animationStateFromSpriteIntent)).toEqual([
      "idle",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "review",
    ]);
  });
});
