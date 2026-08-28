import { ink, paper, semantic } from "@pets-driven/design-system/tokens";
import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { presentWorldItem } from "@pets-driven/pet-engine/features/items/item-presentation";
import {
  type AssetCatalog,
  drawPetSpriteCanvas,
} from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";
import { resolvePetSpriteFrame } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-frame";
import { drawBallArt } from "@/artwork/prop-artwork";
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
  const viewport = snapshot.viewport ?? {
    x: 0,
    y: 0,
    width: snapshot.width,
    height: snapshot.height,
  };
  const projectsVirtualDesktop = !!snapshot.viewport || !!snapshot.monitors?.length;
  if (projectsVirtualDesktop) {
    context.save?.();
    context.translate?.(-viewport.x, -viewport.y);
    drawMonitorWorkAreas(context, snapshot.monitors ?? []);
  }

  for (const surface of snapshot.climbableSurfaces) {
    drawClimbableSurface(context, surface, snapshot.height);
  }

  // Below the pets, so a pet standing on a trinket hides it the moment before
  // it collects it. The ball goes under them for the same reason: a pet that
  // has just walked into it should read as being in front of it.
  for (const item of snapshot.items ?? []) {
    drawWorldItem(context, item, elapsedMs);
  }

  for (const prop of snapshot.props ?? []) {
    drawWorldProp(context, prop);
  }

  // A prop has a physics body, so it turns up here too — and with no sprite
  // against its id it fell through to drawDebugBody, which painted a green box
  // squarely over the artwork drawn just above. Props own their drawing; this
  // loop is for pets and for whatever else has no drawing of its own.
  const propIds = new Set((snapshot.props ?? []).map((prop) => prop.id));

  for (const body of snapshot.bodies) {
    if (propIds.has(body.id)) {
      drawInteractionOutline(context, body.x, body.y, body.width, body.height, body.interaction);
      continue;
    }
    const sprite = assets[body.id];
    if (sprite) {
      const frame = resolvePetSpriteFrame({
        animationState: body.animationState ?? "idle",
        elapsedMs,
        size: { width: body.width, height: body.height },
        scale: body.interaction?.scale,
      });
      const { width: drawWidth, height: drawHeight } = frame.drawSize;

      drawPetSpriteCanvas(context, sprite, frame, { x: body.x, y: body.y });
      drawAgentTaskState(
        context,
        body.x,
        body.y,
        drawWidth,
        drawHeight,
        matchingAgentTask(snapshot, body.id),
      );
      drawInteractionOutline(context, body.x, body.y, drawWidth, drawHeight, body.interaction);
      continue;
    }

    drawDebugBody(context, body);
    drawAgentTaskState(
      context,
      body.x,
      body.y,
      body.width,
      body.height,
      matchingAgentTask(snapshot, body.id),
    );
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
        ? `${pet.steering} / ${pet.locomotion} / ${pet.action}`
        : `${pet.steering} / ${pet.locomotion}`,
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

/**
 * A trinket on the desktop floor: a soft halo so it reads against a wallpaper,
 * the kind's glyph, and a bob so it catches the eye. `elapsedMs` is the same
 * host animation clock the sprite frames run on, not simulation time — the bob
 * is presentation, and the engine's item entity has no phase of its own.
 */
function drawWorldItem(
  context: CanvasRenderingContext2D,
  item: NonNullable<WorldSnapshot["items"]>[number],
  elapsedMs: number,
) {
  const bob = Math.sin(elapsedMs / 320) * 3;
  const y = item.position.y + bob;

  context.save?.();
  context.beginPath();
  context.ellipse?.(item.position.x, item.position.y + 18, 14, 4, 0, 0, Math.PI * 2);
  context.fillStyle = `${ink[500]}33`;
  context.fill();

  context.beginPath();
  context.ellipse?.(item.position.x, y, 18, 18, 0, 0, Math.PI * 2);
  context.fillStyle = `${semantic.info}2b`;
  context.fill();

  context.font = "24px Nunito, system-ui, sans-serif";
  context.textAlign = "center";
  context.fillStyle = ink[950];
  context.fillText(presentWorldItem(item.kind).glyph, item.position.x, y + 8);
  context.restore?.();
}

/**
 * A prop on the desktop. No bob and no halo, unlike a trinket: the ball is a
 * body, so it already moves on its own and drawing it as though it floated
 * would fight the physics the user can see. What it gets instead is its
 * rotation — the snapshot's `angle`, straight off the Matter body — which is
 * the only thing that makes a roll read as a roll rather than a slide.
 *
 * The drawing itself comes from `artwork/prop-artwork`, the same source the
 * desktop overlay window renders, so the two surfaces cannot show two different
 * balls.
 */
function drawWorldProp(
  context: CanvasRenderingContext2D,
  prop: NonNullable<WorldSnapshot["props"]>[number],
) {
  context.save?.();
  context.beginPath();
  context.ellipse?.(
    prop.position.x,
    prop.position.y + prop.radius,
    prop.radius,
    4,
    0,
    0,
    Math.PI * 2,
  );
  context.fillStyle = `${ink[500]}33`;
  context.fill();
  context.restore?.();

  drawBallArt(context, prop.position.x, prop.position.y, prop.radius, prop.angle);
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

function formatPetOverlayText(visualCueIcon: string | undefined, speech: string | null) {
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
  context.strokeRect(x - width / 2 - 7, y - height / 2 - 7, width + 14, height + 14);

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
  interaction:
    | { controllable?: boolean; selected?: boolean; controlled?: boolean; dragged?: boolean }
    | undefined,
) {
  if (
    !interaction?.controllable &&
    !interaction?.selected &&
    !interaction?.controlled &&
    !interaction?.dragged
  ) {
    return;
  }

  const isActive = interaction.selected || interaction.controlled || interaction.dragged;
  context.save?.();
  context.lineWidth = isActive ? 3 : 1.5;
  context.strokeStyle = isActive ? semantic.info : ink[400];
  context.strokeRect(x - width / 2 - 4, y - height / 2 - 4, width + 8, height + 8);
  context.restore?.();
}
