import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "@/core/world-snapshot";
import {
  overlayFromPet,
  projectWorldSnapshotToPetWindows,
  spriteIntentFromBody,
} from "@/pet-window/pet-window-projection";

function snapshotFixture(): WorldSnapshot {
  return {
    width: 960,
    height: 540,
    climbableSurfaces: [],
    bodies: [
      {
        id: "pet-a",
        x: 600,
        y: 500,
        vx: 0,
        vy: 0,
        shape: "rectangle",
        width: 48,
        height: 52,
        animationState: "running-left",
        spriteFacing: "left",
      },
    ],
    pets: [
      {
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        intent: "seek",
        locomotion: "walking",
        speech: "hello",
        position: { x: 600, y: 500 },
        contact: { grounded: true, climbableSurfaceId: null },
        motionTarget: null,
        decision: null,
        pendingReaction: null,
      },
    ],
  };
}

describe("pet window projection", () => {
  it("maps body atlas states into Pet Window sprite intents", () => {
    expect(
      spriteIntentFromBody({
        id: "pet-a",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        shape: "rectangle",
        width: 48,
        height: 52,
        animationState: "running-right",
        spriteFacing: "right",
      }),
    ).toEqual({ kind: "travel", direction: "right" });

    expect(
      spriteIntentFromBody({
        id: "pet-a",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        shape: "rectangle",
        width: 48,
        height: 52,
        animationState: "running",
        spriteFacing: "left",
      }),
    ).toEqual({ kind: "working", facing: "left" });
  });

  it("prioritizes attention overlays over speech and visual cues", () => {
    const pet = snapshotFixture().pets[0];

    expect(
      overlayFromPet({
        ...pet,
        heldAgentState: { kind: "waiting", label: "WAIT" },
        speech: "hello",
        visualCue: { kind: "surprised", icon: "!", label: "Surprised" },
      }),
    ).toEqual({ kind: "attention", label: "WAIT" });
  });

  it("projects world pet positions into desktop Pet Window updates", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshotFixture(),
      { x: 100, y: 200, width: 960, height: 540 },
      12,
    );

    expect(projection).toEqual({
      petId: "pet-a",
      position: {
        sequence: 12,
        petId: "pet-a",
        x: 604,
        y: 596,
        width: 192,
        height: 208,
      },
      presentation: {
        sequence: 12,
        petId: "pet-a",
        intent: { kind: "travel", direction: "left" },
        overlay: { kind: "speech", label: "hello" },
      },
    });
  });

  it("maps playground x coordinates across the full desktop projection width", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshotFixture(),
      { x: 100, y: 200, width: 1920, height: 540 },
      12,
    );

    expect(projection.position.x).toBe(1204);
    expect(projection.position.y).toBe(596);
  });
});
