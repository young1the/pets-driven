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
        body.x - body.width / 2,
        body.y - body.height / 2,
        body.width,
        body.height,
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

    if (pet.visualCue) {
      context.textAlign = "center";
      context.fillStyle = "#dc2626";
      context.font = "20px Inter, Arial, sans-serif";
      context.fillText(
        pet.visualCue.icon,
        pet.position.x,
        pet.position.y - (pet.speech ? 80 : 48),
      );
    }

    context.textAlign = "center";
    context.fillStyle = "#172033";
    context.font = "12px Inter, Arial, sans-serif";
    context.fillText(pet.name, pet.position.x, pet.position.y - 32);
    context.fillStyle = "#526074";
    context.fillText(
      pet.action && pet.action !== "none"
        ? `${pet.intent} / ${pet.locomotion} / ${pet.action}`
        : `${pet.intent} / ${pet.locomotion}`,
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
