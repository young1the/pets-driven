import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import {
  createPetDiagnosticsTracker,
  formatPetDiagnosticsReport,
} from "@/app-state/pet-debug-diagnostics";

function snapshotFixture(input?: {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  intent?: string;
  motionTarget?: { x: number; y: number } | null;
}): WorldSnapshot {
  const x = input?.x ?? 120;
  const y = input?.y ?? 400;
  const vx = input?.vx ?? 0;
  const vy = input?.vy ?? 0;
  const motionTarget = input?.motionTarget ?? { x: 220, y: 400 };

  return {
    width: 960,
    height: 540,
    viewport: { x: 0, y: 0, width: 960, height: 540 },
    monitors: [{ id: "primary", x: 0, y: 0, width: 960, height: 540 }],
    bodies: [
      {
        id: "pet-a",
        x,
        y,
        vx,
        vy,
        shape: "rectangle",
        width: 96,
        height: 114,
        animationState: "idle",
        spriteFacing: "right",
      },
    ],
    pets: [
      {
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        intent: input?.intent ?? "active",
        locomotion: "walk",
        speech: null,
        position: { x, y },
        contact: { grounded: true, climbableSurfaceId: null },
        motionTarget,
        decision: { source: "autonomous", reason: "wander-far", decidedAt: 0 },
        pendingReaction: null,
        agentTask: null,
        visualCue: null,
      },
    ],
    climbableSurfaces: [],
  };
}

describe("pet debug diagnostics", () => {
  it("flags a pet that stays still while it has an active motion target", () => {
    const tracker = createPetDiagnosticsTracker({
      stallAfterMs: 2_000,
      stillDistancePx: 0.5,
      stillSpeedPxPerMs: 0.02,
    });

    tracker.record({ now: 0, sequence: 1, snapshot: snapshotFixture() });
    tracker.record({ now: 1_000, sequence: 2, snapshot: snapshotFixture() });
    const diagnostics = tracker.record({
      now: 2_100,
      sequence: 3,
      snapshot: snapshotFixture(),
    });

    expect(diagnostics.pets[0]).toMatchObject({
      id: "pet-a",
      stall: {
        state: "suspected",
        stationaryForMs: 2_100,
      },
    });
    expect(diagnostics.pets[0].signals).toContain("has-motion-target");
    expect(diagnostics.pets[0].signals).toContain("active-intent");
  });

  it("formats a complete copyable report with recent samples", () => {
    const tracker = createPetDiagnosticsTracker({
      stallAfterMs: 2_000,
      stillDistancePx: 0.5,
      stillSpeedPxPerMs: 0.02,
    });
    const snapshot = snapshotFixture();

    tracker.record({ now: 0, sequence: 1, snapshot });
    tracker.record({ now: 2_100, sequence: 2, snapshot });

    const report = formatPetDiagnosticsReport({
      capturedAt: "2026-06-29T01:00:00.000Z",
      diagnostics: tracker.current(),
      reason: "manual-copy",
      sequence: 2,
      snapshot,
    });

    expect(report).toContain("Pets-Driven Pet Diagnostics");
    expect(report).toContain("reason: manual-copy");
    expect(report).toContain("pet-a (Alice)");
    expect(report).toContain("STALL: suspected");
    expect(report).toContain("targetDistancePx: 100.00");
    expect(report).toContain("recentSamples:");
  });
});
