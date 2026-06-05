import { describe, expect, it } from "vitest";
import {
  createMonitorBoundaryEntities,
  getWorldViewport,
  type MonitorWorkArea,
} from "@/core/monitor-geometry";

describe("monitor geometry", () => {
  const singleMonitor: MonitorWorkArea[] = [
    { id: "monitor", x: 0, y: 0, width: 960, height: 540 },
  ];

  const dualMonitor: MonitorWorkArea[] = [
    { id: "left", x: -640, y: 0, width: 640, height: 480 },
    { id: "primary", x: 0, y: 0, width: 960, height: 540 },
  ];

  it("computes a viewport that preserves negative virtual-desktop coordinates", () => {
    expect(getWorldViewport(dualMonitor)).toEqual({
      x: -640,
      y: 0,
      width: 1600,
      height: 540,
    });
  });

  it("keeps the existing single-monitor boundary entity ids", () => {
    const entities = createMonitorBoundaryEntities(singleMonitor, 48);

    expect(entities.map((entity) => entity.id)).toEqual([
      "monitor-ground",
      "monitor-ceiling",
      "monitor-left-wall",
      "monitor-right-wall",
    ]);
  });

  it("opens shared monitor edges and closes exposed gap edges", () => {
    const entities = createMonitorBoundaryEntities(dualMonitor, 48);

    expect(entities.some((entity) => entity.id === "left-right-wall")).toBe(false);
    expect(entities).toContainEqual({
      id: "primary-left-wall-0",
      components: [
        { type: "Ground" },
        { type: "Transform", position: { x: -24, y: 510 } },
        { type: "PhysicsBody", shape: "rectangle", width: 48, height: 60 },
        { type: "PhysicsMaterial", friction: 0.8, restitution: 0 },
      ],
    });
  });
});
