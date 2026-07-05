import type {
  PetSnapshot,
  WorldSnapshot,
} from "@pets-driven/pet-engine/core/world-snapshot";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import {
  clampPetWindowScale,
  DEFAULT_PET_WINDOW_SCALE,
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
import {
  presentBehaviorDecisionToken,
  presentPetExpression,
} from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";

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

    const petScale = clampPetWindowScale(
      scaleByPetId?.[pet.id] ?? DEFAULT_PET_WINDOW_SCALE,
    );
    const windowWidth = PET_CELL_SIZE.width * petScale;
    const windowHeight =
      (PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD) * petScale;

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
              PET_WINDOW_BODY_ANCHOR_OFFSET * petScale +
              (PET_WINDOW_BUBBLE_OVERHEAD / 2) * petScale,
            width: windowWidth,
            height: windowHeight,
          },
          sprite: {
            decisionEmote: pet.expression
              ? presentPetExpression(pet.expression)
              : presentBehaviorDecisionToken(pet.decision?.reason),
            animationState: body.animationState ?? "idle",
            activity: pet.activity ?? null,
          },
          overlay: overlayFromPet(pet),
        },
      },
    ];
  });
}

export function projectScreenPointToWorld(
  snapshot: WorldSnapshot,
  bounds: PetWindowProjectionBounds,
  screenPoint: { x: number; y: number },
) {
  const scaleX = bounds.width / snapshot.width;
  const scaleY = bounds.height / snapshot.height;
  const viewport = snapshot.viewport ?? {
    x: 0,
    y: 0,
    width: snapshot.width,
    height: snapshot.height,
  };

  return {
    x: viewport.x + (screenPoint.x - bounds.x) / scaleX,
    y: viewport.y + (screenPoint.y - bounds.y) / scaleY,
  };
}

export function overlayFromPet(pet: PetSnapshot): PetWindowOverlay | null {
  if (pet.agentChannel) {
    return {
      kind: "agent-channel",
      status: pet.agentChannel.status,
      label: pet.agentChannel.label,
      message: pet.agentChannel.message,
    };
  }

  return null;
}
