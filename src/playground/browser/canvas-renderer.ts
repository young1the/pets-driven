import type { WorldSnapshot } from "../../core/snapshots/world-snapshot";
import { drawDebugBody } from "./debug-overlay";

export type AssetCatalog = Record<string, HTMLImageElement>;

export function drawWorld(
  context: CanvasRenderingContext2D,
  snapshot: WorldSnapshot,
  assets: AssetCatalog,
) {
  context.clearRect(0, 0, snapshot.width, snapshot.height);

  for (const body of snapshot.bodies) {
    const sprite = assets[body.id];
    if (sprite) {
      context.drawImage(sprite, body.x - 48, body.y - 52, 96, 104);
      continue;
    }

    drawDebugBody(context, body);
  }
}
