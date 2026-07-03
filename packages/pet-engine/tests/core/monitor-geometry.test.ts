import { describe, expect, it } from "vitest";
import {
  createMonitorBoundaryEntities,
  getWorldViewport,
  type MonitorWorkArea,
} from "@pets-driven/pet-engine/core/monitor-geometry";

describe("monitor geometry", () => {
  const singleMonitor: MonitorWorkArea[] = [
    { id: "monitor", x: 0, y: 0, width: 1920, height: 1080 },
  ];

  const dualMonitor: MonitorWorkArea[] = [
    { id: "left", x: -1280, y: 0, width: 1280, height: 960 },
    { id: "primary", x: 0, y: 0, width: 1920, height: 1080 },
  ];

  it("computes a viewport that preserves negative virtual-desktop coordinates", () => {
    expect(getWorldViewport(dualMonitor)).toEqual({
      x: -1280,
      y: 0,
      width: 3200,
      height: 1080,
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
        { type: "Transform", position: { x: -24, y: 1020 } },
        { type: "PhysicsBody", shape: "rectangle", width: 48, height: 120 },
        { type: "PhysicsMaterial", friction: 0.8, restitution: 0 },
      ],
    });
  });
});
