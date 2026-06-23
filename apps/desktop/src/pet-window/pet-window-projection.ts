import type {
  BodySnapshot,
  PetSnapshot,
  WorldSnapshot,
} from "@pets-driven/pet-engine/core/world-snapshot";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import {
  PET_WINDOW_BUBBLE_OVERHEAD,
  PET_WINDOW_LAYOUT,
} from "@/pet-window/pet-window-layout";

// The visible pet fills the body rect, which sits below the sprite cell's
// vertical centre. Anchor that rect onto the physics body so the pet's feet
// meet the floor instead of sinking the extra cell margin behind the taskbar.
// The art's feet sit a little above the body rect's bottom, so lift by twice
// the rect offset to land them on the floor.
const PET_WINDOW_BODY_ANCHOR_OFFSET =
  (PET_WINDOW_LAYOUT.body.y -
    PET_WINDOW_BUBBLE_OVERHEAD +
    PET_WINDOW_LAYOUT.body.height / 2 -
    PET_CELL_SIZE.height / 2) *
  2;
import type {
  PetWindowFrame,
  PetWindowOverlay,
} from "@/pet-window/pet-window-messages";
import type { PetSpriteIntent } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-intent";
import { presentBehaviorDecisionToken } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";

export type PetWindowProjection = {
  petId: string;
  frame: PetWindowFrame;
};

export type PetWindowProjectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function projectWorldSnapshotToPetWindows(
  snapshot: WorldSnapshot,
  bounds: PetWindowProjectionBounds,
  sequence: number,
  scaleByPetId?: Record<string, number>,
): PetWindowProjection[] {
  const scaleX = bounds.width / snapshot.width;
  const scaleY = bounds.height / snapshot.height;
  const viewport = snapshot.viewport ?? {
    x: 0,
    y: 0,
    width: snapshot.width,
    height: snapshot.height,
  };

  return snapshot.pets.flatMap((pet) => {
    const body = snapshot.bodies.find((candidate) => candidate.id === pet.id);

    if (!body) {
      return [];
    }

    const petScale = scaleByPetId?.[pet.id] ?? 1;
    const windowWidth = PET_CELL_SIZE.width * petScale;
    const windowHeight = PET_CELL_SIZE.height * petScale;

    return [
      {
        petId: pet.id,
        frame: {
          schemaVersion: 1,
          sequence,
          petId: pet.id,
          window: {
            x: bounds.x + (body.x - viewport.x) * scaleX - windowWidth / 2,
            y:
              bounds.y +
              (body.y - viewport.y) * scaleY -
              windowHeight / 2 -
              PET_WINDOW_BUBBLE_OVERHEAD -
              PET_WINDOW_BODY_ANCHOR_OFFSET * petScale,
            width: windowWidth,
            height: windowHeight + PET_WINDOW_BUBBLE_OVERHEAD,
          },
          sprite: {
            decisionEmote: presentBehaviorDecisionToken(pet.decision?.reason),
            intent: spriteIntentFromBody(body),
          },
          overlay: overlayFromPet(pet),
        },
      },
    ];
  });
}

export function spriteIntentFromBody(body: BodySnapshot): PetSpriteIntent {
  switch (body.animationState) {
    case "running-right":
      return { kind: "travel", direction: "right" };
    case "running-left":
      return { kind: "travel", direction: "left" };
    case "running":
      return { kind: "working", facing: body.spriteFacing };
    case "waving":
    case "jumping":
    case "failed":
    case "waiting":
    case "review":
      return { kind: body.animationState, facing: body.spriteFacing };
    case "idle":
    default:
      return { kind: "idle", facing: body.spriteFacing };
  }
}

export function overlayFromPet(pet: PetSnapshot): PetWindowOverlay | null {
  if (pet.heldAgentState) {
    return {
      kind: "attention",
      label: pet.heldAgentState.label,
    };
  }

  if (pet.speech) {
    return {
      kind: "speech",
      label: pet.speech,
    };
  }

  if (pet.visualCue) {
    return {
      kind: "status",
      label: pet.visualCue.icon,
    };
  }

  return null;
}
