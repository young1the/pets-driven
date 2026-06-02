import type { PetAnimationState } from "@/pets/assets/pet-atlas";

export type PetSpriteIntent =
  | { kind: "travel"; direction: "left" | "right" }
  | { kind: "working" }
  | { kind: "idle" }
  | { kind: "waving" }
  | { kind: "jumping" }
  | { kind: "failed" }
  | { kind: "waiting" }
  | { kind: "review" };

export function animationStateFromSpriteIntent(
  intent: PetSpriteIntent,
): PetAnimationState {
  switch (intent.kind) {
    case "travel":
      return intent.direction === "right" ? "running-right" : "running-left";
    case "working":
      return "running";
    default:
      return intent.kind;
  }
}
