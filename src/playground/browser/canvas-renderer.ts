import type { WorldSnapshot } from "@/core/world-snapshot";
import {
  getAtlasFrame,
  PET_CELL_SIZE,
  shouldMirrorSprite,
} from "@/pets/assets/pet-atlas";
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
      const scale = body.interaction?.scale ?? 1;
      const drawWidth = body.width * scale;
      const drawHeight = body.height * scale;
      const atlasFrame = getAtlasFrame(
        body.animationState ?? "idle",
        elapsedMs,
        body.spriteFacing,
      );
      const shouldMirror = shouldMirrorSprite(
        body.animationState ?? "idle",
        body.spriteFacing,
      );
      if (shouldMirror) {
        context.save();
        context.translate(body.x, body.y);
        context.scale(-1, 1);
        context.drawImage(
          sprite,
          atlasFrame.sourceX,
          atlasFrame.sourceY,
          PET_CELL_SIZE.width,
          PET_CELL_SIZE.height,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight,
        );
        context.restore();
        drawHeldAgentState(context, body.x, body.y, drawWidth, drawHeight, matchingHeldState(snapshot, body.id));
        drawInteractionOutline(context, body.x, body.y, drawWidth, drawHeight, body.interaction);
        continue;
      }

      context.drawImage(
        sprite,
        atlasFrame.sourceX,
        atlasFrame.sourceY,
        PET_CELL_SIZE.width,
        PET_CELL_SIZE.height,
        body.x - drawWidth / 2,
        body.y - drawHeight / 2,
        drawWidth,
        drawHeight,
      );
      drawHeldAgentState(context, body.x, body.y, drawWidth, drawHeight, matchingHeldState(snapshot, body.id));
      drawInteractionOutline(context, body.x, body.y, drawWidth, drawHeight, body.interaction);
      continue;
    }

    drawDebugBody(context, body);
    drawHeldAgentState(context, body.x, body.y, body.width, body.height, matchingHeldState(snapshot, body.id));
    drawInteractionOutline(context, body.x, body.y, body.width, body.height, body.interaction);
  }

  for (const pet of snapshot.pets) {
    if (pet.contact.grounded) {
      drawGroundContact(context, pet.position.x, pet.position.y);
    }

    if (pet.motionTarget) {
      drawMotionTargetMarker(context, pet.motionTarget.x, pet.motionTarget.y);
    }

    const overlayText = formatPetOverlayText(pet.visualCue?.icon, pet.speech);

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

    if (overlayText) {
      context.fillStyle = "#ffffff";
      context.fillRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
      context.strokeStyle = "#ccd5e0";
      context.strokeRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
      context.fillStyle = "#172033";
      context.fillText(overlayText, pet.position.x, pet.position.y - 48);
    }
  }
}

function matchingHeldState(snapshot: WorldSnapshot, id: string) {
  return snapshot.pets.find((pet) => pet.id === id)?.heldAgentState ?? null;
}

function formatPetOverlayText(
  visualCueIcon: string | undefined,
  speech: string | null,
) {
  return visualCueIcon ?? speech ?? null;
}

function drawHeldAgentState(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  heldState: { kind: "waiting" | "failed" | "completed"; label: "WAIT" | "FAIL" | "DONE" } | null,
) {
  if (!heldState) return;

  const colors = {
    waiting: "#f59e0b",
    failed: "#dc2626",
    completed: "#16a34a",
  } as const;
  const color = colors[heldState.kind];

  context.save?.();
  context.lineWidth = 4;
  context.strokeStyle = color;
  context.strokeRect(
    x - width / 2 - 7,
    y - height / 2 - 7,
    width + 14,
    height + 14,
  );

  context.font = "bold 11px Inter, Arial, sans-serif";
  context.textAlign = "center";
  const badgeWidth = 46;
  const badgeX = x - badgeWidth / 2;
  const badgeY = y - height / 2 - 28;
  context.fillStyle = "#ffffff";
  context.fillRect(badgeX, badgeY, badgeWidth, 18);
  context.strokeStyle = color;
  context.strokeRect(badgeX, badgeY, badgeWidth, 18);
  context.fillStyle = color;
  context.fillText(heldState.label, x, badgeY + 13);
  context.restore?.();
}

function drawInteractionOutline(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  interaction: { controllable?: boolean; selected?: boolean; controlled?: boolean; dragged?: boolean } | undefined,
) {
  if (!interaction?.controllable && !interaction?.selected && !interaction?.controlled && !interaction?.dragged) {
    return;
  }

  const isActive = interaction.selected || interaction.controlled || interaction.dragged;
  context.save?.();
  context.lineWidth = isActive ? 3 : 1.5;
  context.strokeStyle = isActive ? "#2563eb" : "#94a3b8";
  context.strokeRect(
    x - width / 2 - 4,
    y - height / 2 - 4,
    width + 8,
    height + 8,
  );
  context.restore?.();
}
