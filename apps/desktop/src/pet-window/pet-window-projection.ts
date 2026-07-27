import type { PetSnapshot, WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import {
  PET_CELL_SIZE,
  resolveRunningDirection,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
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

import {
  presentBehaviorDecisionToken,
  presentPetExpression,
} from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetWindowFrame, PetWindowOverlay } from "@/pet-window/pet-window-messages";

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

/**
 * @param swapRunningByPetId Pets whose spritesheet draws the two running rows
 *   the opposite way round from the atlas, so the frame must carry the *other*
 *   directional row. A per-pet property of the look, like `scaleByPetId`, which
 *   is why it is resolved here rather than anywhere in the engine.
 */
export function projectWorldSnapshotToPetWindows(
  snapshot: WorldSnapshot,
  bounds: PetWindowProjectionBounds,
  sequence: number,
  scaleByPetId?: Record<string, number>,
  swapRunningByPetId?: Record<string, boolean>,
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

    const petScale = clampPetWindowScale(scaleByPetId?.[pet.id] ?? DEFAULT_PET_WINDOW_SCALE);
    // The sprite frame scales with petScale; width/height below drive the
    // sprite's rendered size.
    const windowWidth = PET_CELL_SIZE.width * petScale;
    const windowHeight = (PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD) * petScale;
    // The desktop pet window is created at this fixed size (see
    // open_adopted_pet_window / open_pet_window_playground: inner_size 192×268)
    // and never shrinks — it is non-resizable, so setSize is a no-op and the
    // scaled sprite frame is centred inside this fixed window (place-items:
    // center in pet-window.css). So the host must position the FIXED window
    // centred on the pet, not the scaled frame; otherwise a min-scale (0.5) pet
    // is centred low in the oversized window and its feet sink below the floor
    // while a full-size pet (frame == window) sits correctly.
    const osWindowWidth = PET_CELL_SIZE.width;
    const osWindowHeight = PET_CELL_SIZE.height + PET_WINDOW_BUBBLE_OVERHEAD;

    return [
      {
        petId: pet.id,
        frame: {
          schemaVersion: 1,
          sequence,
          petId: pet.id,
          window: {
            x: bounds.x + (body.x - viewport.x) * scaleX - osWindowWidth / 2,
            y:
              bounds.y +
              (body.y - viewport.y) * scaleY -
              osWindowHeight / 2 -
              // Scaled with the sprite so the feet land the same way at every
              // size (an unscaled constant here only lined up at scale 1).
              PET_WINDOW_BUBBLE_OVERHEAD * petScale -
              PET_WINDOW_BODY_ANCHOR_OFFSET * petScale +
              (PET_WINDOW_BUBBLE_OVERHEAD / 2) * petScale,
            width: windowWidth,
            height: windowHeight,
          },
          sprite: {
            decisionEmote: pet.expression
              ? presentPetExpression(pet.expression)
              : presentBehaviorDecisionToken(pet.decision?.reason),
            animationState: resolveRunningDirection(
              body.animationState ?? "idle",
              swapRunningByPetId?.[pet.id] ?? false,
            ),
            activity: pet.activity ?? null,
            partnerName: pet.social?.partnerName ?? null,
            working: pet.agentTask?.status === "working",
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
