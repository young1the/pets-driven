import type { BodySnapshot } from "@/core/snapshots/world-snapshot";

export function drawDebugBody(context: CanvasRenderingContext2D, body: BodySnapshot) {
  context.beginPath();
  context.rect(body.x - body.width / 2, body.y - body.height / 2, body.width, body.height);
  context.fill();
  context.stroke();
}
