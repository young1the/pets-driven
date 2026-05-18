import type { BodySnapshot } from "@/core/snapshots/world-snapshot";

export function drawDebugBody(context: CanvasRenderingContext2D, body: BodySnapshot) {
  context.beginPath();
  context.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}
