import type { WorldSnapshot } from "@/core/world-snapshot";
import { getAtlasFrame, PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import {
  drawClimbableSurface,
  drawDebugBody,
  drawGroundContact,
  drawMotionTargetMarker,
} from "./debug-overlay";

export type AssetCatalog = Record<string, HTMLImageElement>;

export function drawWorld(
  context: CanvasRenderingContext2D,
  snapshot: WorldSnapshot,
  assets: AssetCatalog,
  elapsedMs = 0,
) {
  context.clearRect(0, 0, snapshot.width, snapshot.height);

  for (const surface of snapshot.climbableSurfaces) {
    drawClimbableSurface(context, surface, snapshot.height);
  }

  for (const body of snapshot.bodies) {
    const sprite = assets[body.id];
    if (sprite) {
      const atlasFrame = getAtlasFrame(
        body.animationState ?? "idle",
        elapsedMs,
      );
      context.drawImage(
        sprite,
        atlasFrame.sourceX,
        atlasFrame.sourceY,
        PET_CELL_SIZE.width,
        PET_CELL_SIZE.height,
        body.x - 48,
        body.y - 52,
        96,
        104,
      );
      continue;
    }

    drawDebugBody(context, body);
  }

  for (const pet of snapshot.pets) {
    if (pet.contact.grounded) {
      drawGroundContact(context, pet.position.x, pet.position.y);
    }

    if (pet.motionTarget) {
      drawMotionTargetMarker(context, pet.motionTarget.x, pet.motionTarget.y);
    }

    context.textAlign = "center";
    context.fillStyle = "#172033";
    context.font = "12px Inter, Arial, sans-serif";
    context.fillText(pet.name, pet.position.x, pet.position.y - 32);
    context.fillStyle = "#526074";
    context.fillText(
      `${pet.intent} / ${pet.locomotion}`,
      pet.position.x,
      pet.position.y - 16,
    );

    if (pet.speech) {
      context.fillStyle = "#ffffff";
      context.fillRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
      context.strokeStyle = "#ccd5e0";
      context.strokeRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
      context.fillStyle = "#172033";
      context.fillText(pet.speech, pet.position.x, pet.position.y - 48);
    }
  }
}
