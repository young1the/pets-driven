import type {
  BodySnapshot,
  ClimbableSurfaceSnapshot,
} from "@/core/world-snapshot";

const CLIMBABLE_SURFACE_LABEL = "CLIMB SPACE";
const CLIMBABLE_SURFACE_MARKER_WIDTH = 24;
const CLIMBABLE_SURFACE_MARKER_TOP = 24;

export function drawDebugBody(
  context: CanvasRenderingContext2D,
  body: BodySnapshot,
) {
  context.beginPath();
  context.rect(
    body.x - body.width / 2,
    body.y - body.height / 2,
    body.width,
    body.height,
  );
  context.fill();
  context.stroke();
}

export function drawClimbableSurface(
  context: CanvasRenderingContext2D,
  surface: ClimbableSurfaceSnapshot,
  worldHeight: number,
) {
  const markerHeight = Math.max(
    96,
    worldHeight - CLIMBABLE_SURFACE_MARKER_TOP * 2,
  );
  const markerX = surface.position.x - CLIMBABLE_SURFACE_MARKER_WIDTH / 2;

  context.fillStyle = "rgba(22, 163, 74, 0.26)";
  context.fillRect(
    markerX,
    CLIMBABLE_SURFACE_MARKER_TOP,
    CLIMBABLE_SURFACE_MARKER_WIDTH,
    markerHeight,
  );
  context.strokeStyle = "#15803d";
  context.strokeRect(
    markerX,
    CLIMBABLE_SURFACE_MARKER_TOP,
    CLIMBABLE_SURFACE_MARKER_WIDTH,
    markerHeight,
  );
  context.fillStyle = "#14532d";
  context.font = "bold 18px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.fillText(
    CLIMBABLE_SURFACE_LABEL,
    surface.position.x,
    CLIMBABLE_SURFACE_MARKER_TOP + 24,
  );
}

export function drawGroundContact(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  context.beginPath();
  context.ellipse(x, y + 7, 12, 4, 0, 0, Math.PI * 2);
  context.fillStyle = "rgba(22, 163, 74, 0.4)";
  context.fill();
}

export function drawMotionTargetMarker(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const half = 6;
  context.beginPath();
  context.moveTo(x - half, y - half);
  context.lineTo(x + half, y + half);
  context.moveTo(x + half, y - half);
  context.lineTo(x - half, y + half);
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 2;
  context.stroke();
}
