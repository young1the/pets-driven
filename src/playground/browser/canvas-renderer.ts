import type { WorldSnapshot } from "../../core/snapshots/world-snapshot";
import { getAtlasFrame, PET_CELL_SIZE } from "../../pets/assets/pet-atlas";
import { drawDebugBody } from "./debug-overlay";

export type AssetCatalog = Record<string, HTMLImageElement>;

export function drawWorld(
  context: CanvasRenderingContext2D,
  snapshot: WorldSnapshot,
  assets: AssetCatalog,
  elapsedMs = 0,
) {
  context.clearRect(0, 0, snapshot.width, snapshot.height);

  for (const body of snapshot.bodies) {
    const sprite = assets[body.id];
    if (sprite) {
      const atlasFrame = getAtlasFrame(body.animationState ?? "idle", elapsedMs);
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
}
