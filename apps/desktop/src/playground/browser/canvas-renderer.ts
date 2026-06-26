import { ink, paper, semantic } from "@pets-driven/design-system/tokens";
import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import {
  drawPetSpriteCanvas,
  type AssetCatalog,
} from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";
import { resolvePetSpriteFrame } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-frame";
import {
  drawClimbableSurface,
  drawDebugBody,
  drawGroundContact,
  drawMotionTargetMarker,
} from "./debug-overlay";

export function drawWorld(
  context: CanvasRenderingContext2D,
  snapshot: WorldSnapshot,
  assets: AssetCatalog,
  elapsedMs = 0,
) {
  context.clearRect(0, 0, snapshot.width, snapshot.height);
  const viewport = snapshot.viewport ?? { x: 0, y: 0, width: snapshot.width, height: snapshot.height };
  const projectsVirtualDesktop = !!snapshot.viewport || !!snapshot.monitors?.length;
  if (projectsVirtualDesktop) {
    context.save?.();
    context.translate?.(-viewport.x, -viewport.y);
    drawMonitorWorkAreas(context, snapshot.monitors ?? []);
  }

  for (const surface of snapshot.climbableSurfaces) {
    drawClimbableSurface(context, surface, snapshot.height);
  }

  for (const body of snapshot.bodies) {
    const sprite = assets[body.id];
    if (sprite) {
      const frame = resolvePetSpriteFrame({
        animationState: body.animationState ?? "idle",
        elapsedMs,
        facing: body.spriteFacing,
        size: { width: body.width, height: body.height },
        scale: body.interaction?.scale,
      });
      const { width: drawWidth, height: drawHeight } = frame.drawSize;

      drawPetSpriteCanvas(
        context,
        sprite,
        frame,
        { x: body.x, y: body.y },
      );
      drawAgentTaskState(context, body.x, body.y, drawWidth, drawHeight, matchingAgentTask(snapshot, body.id));
      drawInteractionOutline(context, body.x, body.y, drawWidth, drawHeight, body.interaction);
      continue;
    }

    drawDebugBody(context, body);
    drawAgentTaskState(context, body.x, body.y, body.width, body.height, matchingAgentTask(snapshot, body.id));
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
    context.fillStyle = ink[950];
    context.font = "700 12px Nunito, system-ui, sans-serif";
    context.fillText(pet.name, pet.position.x, pet.position.y - 32);
    context.fillStyle = ink[600];
    context.fillText(
      pet.action && pet.action !== "none"
        ? `${pet.intent} / ${pet.locomotion} / ${pet.action}`
        : `${pet.intent} / ${pet.locomotion}`,
      pet.position.x,
      pet.position.y - 16,
    );

    if (overlayText) {
      context.fillStyle = paper;
      context.fillRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
      context.strokeStyle = ink[200];
      context.strokeRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
      context.fillStyle = ink[950];
      context.fillText(overlayText, pet.position.x, pet.position.y - 48);
    }
  }

  if (projectsVirtualDesktop) {
    context.restore?.();
  }
}

function drawMonitorWorkAreas(
  context: CanvasRenderingContext2D,
  monitors: NonNullable<WorldSnapshot["monitors"]>,
) {
  for (const monitor of monitors) {
    context.fillStyle = ink[50];
    context.fillRect?.(monitor.x, monitor.y, monitor.width, monitor.height);
    context.strokeStyle = ink[300];
    context.strokeRect?.(monitor.x, monitor.y, monitor.width, monitor.height);
  }
}

function matchingAgentTask(snapshot: WorldSnapshot, id: string) {
  return snapshot.pets.find((pet) => pet.id === id)?.agentTask ?? null;
}

function formatPetOverlayText(
  visualCueIcon: string | undefined,
  speech: string | null,
) {
  return visualCueIcon ?? speech ?? null;
}

function drawAgentTaskState(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  agentTask: { status: string; label: "WAIT" | "FAIL" | "DONE" | null } | null,
) {
  if (!agentTask?.label) return;

  const colors: Record<string, string> = {
    waiting: semantic.warning,
    failed: semantic.danger,
    completed: semantic.success,
  };
  const color = colors[agentTask.status] ?? semantic.warning;

  context.save?.();
  context.lineWidth = 4;
  context.strokeStyle = color;
  context.strokeRect(
    x - width / 2 - 7,
    y - height / 2 - 7,
    width + 14,
    height + 14,
  );

  context.font = "800 11px Nunito, system-ui, sans-serif";
  context.textAlign = "center";
  const badgeWidth = 46;
  const badgeX = x - badgeWidth / 2;
  const badgeY = y - height / 2 - 28;
  context.fillStyle = paper;
  context.fillRect(badgeX, badgeY, badgeWidth, 18);
  context.strokeStyle = color;
  context.strokeRect(badgeX, badgeY, badgeWidth, 18);
  context.fillStyle = color;
  context.fillText(agentTask.label, x, badgeY + 13);
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
  context.strokeStyle = isActive ? semantic.info : ink[400];
  context.strokeRect(
    x - width / 2 - 4,
    y - height / 2 - 4,
    width + 8,
    height + 8,
  );
  context.restore?.();
}
