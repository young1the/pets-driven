import type { EntityDeclaration } from "@pets-driven/pet-engine/core/component-store";

export type MonitorWorkArea = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorldViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Segment = { start: number; end: number };
type Edge = "ground" | "ceiling" | "left-wall" | "right-wall";

const SURFACE_MATERIAL = { type: "PhysicsMaterial" as const, friction: 0.8, restitution: 0 };

export function getWorldViewport(monitors: MonitorWorkArea[]): WorldViewport {
  if (monitors.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const monitor of monitors) {
    minX = Math.min(minX, monitor.x);
    minY = Math.min(minY, monitor.y);
    maxX = Math.max(maxX, monitor.x + monitor.width);
    maxY = Math.max(maxY, monitor.y + monitor.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function createMonitorBoundaryEntities(
  monitors: MonitorWorkArea[],
  thickness: number,
): EntityDeclaration[] {
  const entities: EntityDeclaration[] = [];

  for (const monitor of monitors) {
    const vertical = { start: monitor.y, end: monitor.y + monitor.height };
    const horizontal = { start: monitor.x, end: monitor.x + monitor.width };
    const leftCuts = touchingVerticalSegments(monitors, monitor.x, "right", vertical);
    const rightCuts = touchingVerticalSegments(monitors, monitor.x + monitor.width, "left", vertical);
    const topCuts = touchingHorizontalSegments(monitors, monitor.y, "bottom", horizontal);
    const bottomCuts = touchingHorizontalSegments(monitors, monitor.y + monitor.height, "top", horizontal);

    for (const [index, segment] of subtractSegments(horizontal, bottomCuts).entries()) {
      entities.push(createHorizontalBoundary(monitor, "ground", segment, index, thickness));
    }
    for (const [index, segment] of subtractSegments(horizontal, topCuts).entries()) {
      entities.push(createHorizontalBoundary(monitor, "ceiling", segment, index, thickness));
    }
    for (const [index, segment] of subtractSegments(vertical, leftCuts).entries()) {
      entities.push(createVerticalBoundary(monitor, "left-wall", segment, index, thickness));
    }
    for (const [index, segment] of subtractSegments(vertical, rightCuts).entries()) {
      entities.push(createVerticalBoundary(monitor, "right-wall", segment, index, thickness));
    }
  }

  return entities;
}

function touchingVerticalSegments(
  monitors: MonitorWorkArea[],
  edgeX: number,
  otherEdge: "left" | "right",
  edgeSpan: Segment,
): Segment[] {
  return monitors
    .filter((monitor) => (otherEdge === "left" ? monitor.x : monitor.x + monitor.width) === edgeX)
    .map((monitor) => overlap(edgeSpan, { start: monitor.y, end: monitor.y + monitor.height }))
    .filter((segment): segment is Segment => segment !== null);
}

function touchingHorizontalSegments(
  monitors: MonitorWorkArea[],
  edgeY: number,
  otherEdge: "top" | "bottom",
  edgeSpan: Segment,
): Segment[] {
  return monitors
    .filter((monitor) => (otherEdge === "top" ? monitor.y : monitor.y + monitor.height) === edgeY)
    .map((monitor) => overlap(edgeSpan, { start: monitor.x, end: monitor.x + monitor.width }))
    .filter((segment): segment is Segment => segment !== null);
}

function overlap(a: Segment, b: Segment): Segment | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

function subtractSegments(base: Segment, cuts: Segment[]): Segment[] {
  const mergedCuts = mergeSegments(cuts);
  const result: Segment[] = [];
  let cursor = base.start;

  for (const cut of mergedCuts) {
    if (cut.end <= cursor) continue;
    if (cut.start > cursor) {
      result.push({ start: cursor, end: Math.min(cut.start, base.end) });
    }
    cursor = Math.max(cursor, cut.end);
    if (cursor >= base.end) break;
  }

  if (cursor < base.end) {
    result.push({ start: cursor, end: base.end });
  }

  return result;
}

function mergeSegments(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];

  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (!last || segment.start > last.end) {
      merged.push({ ...segment });
      continue;
    }
    last.end = Math.max(last.end, segment.end);
  }

  return merged;
}

function createHorizontalBoundary(
  monitor: MonitorWorkArea,
  edge: "ground" | "ceiling",
  segment: Segment,
  index: number,
  thickness: number,
): EntityDeclaration {
  const y =
    edge === "ground"
      ? monitor.y + monitor.height + thickness / 2
      : monitor.y - thickness / 2;

  return createBoundaryEntity({
    id: boundaryId(monitor.id, edge, segment, index, {
      start: monitor.x,
      end: monitor.x + monitor.width,
    }),
    x: (segment.start + segment.end) / 2,
    y,
    width: segment.end - segment.start,
    height: thickness,
  });
}

function createVerticalBoundary(
  monitor: MonitorWorkArea,
  edge: "left-wall" | "right-wall",
  segment: Segment,
  index: number,
  thickness: number,
): EntityDeclaration {
  const x =
    edge === "left-wall"
      ? monitor.x - thickness / 2
      : monitor.x + monitor.width + thickness / 2;

  return createBoundaryEntity({
    id: boundaryId(monitor.id, edge, segment, index, {
      start: monitor.y,
      end: monitor.y + monitor.height,
    }),
    x,
    y: (segment.start + segment.end) / 2,
    width: thickness,
    height: segment.end - segment.start,
  });
}

function boundaryId(
  monitorId: string,
  edge: Edge,
  segment: Segment,
  index: number,
  fullSegment: Segment,
) {
  const suffix = segment.start === fullSegment.start && segment.end === fullSegment.end
    ? ""
    : `-${index}`;
  return `${monitorId}-${edge}${suffix}`;
}

function createBoundaryEntity(input: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): EntityDeclaration {
  return {
    id: input.id,
    components: [
      { type: "Ground" },
      { type: "Transform", position: { x: input.x, y: input.y } },
      {
        type: "PhysicsBody",
        shape: "rectangle",
        width: input.width,
        height: input.height,
      },
      SURFACE_MATERIAL,
    ],
  };
}
