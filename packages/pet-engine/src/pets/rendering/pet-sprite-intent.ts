import type {
  PetAnimationState,
  PetSpriteFacing,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";

export type PetSpriteIntent =
  | { kind: "travel"; direction: PetSpriteFacing }
  | { kind: "working"; facing?: PetSpriteFacing }
  | { kind: "idle"; facing?: PetSpriteFacing }
  | { kind: "waving"; facing?: PetSpriteFacing }
  | { kind: "jumping"; facing?: PetSpriteFacing }
  | { kind: "failed"; facing?: PetSpriteFacing }
  | { kind: "waiting"; facing?: PetSpriteFacing }
  | { kind: "review"; facing?: PetSpriteFacing };

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

export function facingFromSpriteIntent(
  intent: PetSpriteIntent,
): PetSpriteFacing | undefined {
  if (intent.kind === "travel") {
    return intent.direction;
  }

  return intent.facing;
}
