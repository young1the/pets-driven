import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import {
  overlayFromPet,
  projectScreenPointToWorld,
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
        decision: {
          source: "autonomous",
          reason: "request-jump",
          decidedAt: 10,
        },
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
        agentTask: { status: "waiting", label: "WAIT" },
        speech: "hello",
        visualCue: { kind: "surprised", icon: "!", label: "Surprised" },
      }),
    ).toEqual({ kind: "attention", label: "WAIT" });
  });

  it("projects world pet state into desktop Pet Window frames", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshotFixture(),
      { x: 100, y: 200, width: 960, height: 540 },
      12,
    );

    expect(projection).toEqual({
      petId: "pet-a",
      frame: {
        schemaVersion: 1,
        sequence: 12,
        petId: "pet-a",
        window: {
          x: 604,
          y: 520,
          width: 192,
          height: 268,
        },
        sprite: {
          decisionEmote: {
            emote: "sparkle",
            label: "Jump request",
            mood: "excited",
            tone: "spark",
          },
          intent: { kind: "travel", direction: "left" },
        },
        overlay: null,
      },
    });
  });

  it("prefers expression emotes over behavior decision emotes", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = {
      ...snapshot.pets[0],
      decision: {
        source: "autonomous",
        reason: "working-wander",
        decidedAt: 100,
      },
      agentTask: { status: "working", label: null },
      expression: {
        source: "collision",
        mood: "confused",
        emote: "exclaim",
        label: "!",
        startedAt: 120,
        expiresAt: 820,
      },
      visualCue: null,
    };

    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 0, y: 0, width: 1000, height: 800 },
      7,
    );

    expect(projection.frame.sprite.decisionEmote).toEqual({
      emote: "exclaim",
      label: "!",
      mood: "confused",
      tone: "alert",
    });
  });

  it("maps playground x coordinates across the full desktop projection width", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshotFixture(),
      { x: 100, y: 200, width: 1920, height: 540 },
      12,
    );

    expect(projection.frame.window.x).toBe(1204);
    expect(projection.frame.window.y).toBe(520);
  });

  it("projects negative virtual-desktop coordinates relative to the world viewport", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      {
        ...snapshotFixture(),
        width: 1600,
        height: 540,
        viewport: { x: -640, y: 0, width: 1600, height: 540 },
        monitors: [
          { id: "left", x: -640, y: 0, width: 640, height: 480 },
          { id: "primary", x: 0, y: 0, width: 960, height: 540 },
        ],
        bodies: [
          {
            ...snapshotFixture().bodies[0],
            x: -320,
            y: 440,
          },
        ],
      },
      { x: -640, y: 0, width: 1600, height: 540 },
      12,
    );

    expect(projection.frame.window.x).toBe(-416);
    expect(projection.frame.window.y).toBe(260);
  });

  it("clamps oversized saved scales before projecting Pet Window frames", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshotFixture(),
      { x: 100, y: 200, width: 960, height: 540 },
      12,
      { "pet-a": 4 },
    );

    expect(projection.frame.window.width).toBe(384);
    expect(projection.frame.window.height).toBe(536);
  });

  it("maps desktop screen points back into viewport-relative world coordinates", () => {
    expect(
      projectScreenPointToWorld(
        {
          ...snapshotFixture(),
          width: 1600,
          height: 540,
          viewport: { x: -640, y: 0, width: 1600, height: 540 },
        },
        { x: -640, y: 0, width: 1600, height: 540 },
        { x: -320, y: 440 },
      ),
    ).toEqual({ x: -320, y: 440 });
  });
});
