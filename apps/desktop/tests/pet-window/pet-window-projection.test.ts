import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { describe, expect, it } from "vitest";
import {
  overlayFromPet,
  projectScreenPointToWorld,
  projectWorldSnapshotToPetWindows,
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
      },
    ],
    pets: [
      {
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        steering: "arrive",
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
  it("projects agent channel messages into the speech bubble", () => {
    const pet = snapshotFixture().pets[0];

    expect(
      overlayFromPet({
        ...pet,
        agentTask: { status: "waiting", label: "WAIT" },
        agentChannel: {
          source: "agent-task",
          status: "waiting",
          label: "Waiting",
          message: null,
          updatedAt: 100,
          expiresAt: null,
        },
        speech: "hello",
        visualCue: { kind: "surprised", icon: "!", label: "Surprised" },
      }),
    ).toEqual({
      kind: "agent-channel",
      status: "waiting",
      label: "Waiting",
      message: null,
    });
  });

  it("does not project pet visual cues into the agent speech bubble", () => {
    const pet = snapshotFixture().pets[0];

    expect(
      overlayFromPet({
        ...pet,
        agentTask: null,
        agentChannel: null,
        visualCue: { kind: "surprised", icon: "!", label: "Surprised" },
      }),
    ).toBeNull();
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
          y: 543,
          width: 96,
          height: 134,
        },
        sprite: {
          decisionEmote: {
            emote: "sparkle",
            label: "Jump request",
            mood: "excited",
            tone: "spark",
          },
          animationState: "running-left",
          activity: null,
          partnerName: null,
          working: false,
        },
        overlay: null,
      },
    });
  });

  it("passes the engine-canonical activity through to the frame sprite", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = { ...snapshot.pets[0], activity: "chasingCursor" };

    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 0, y: 0, width: 1000, height: 800 },
      7,
    );

    expect(projection.frame.sprite.activity).toBe("chasingCursor");
  });

  it("flags the frame sprite as working while an agent task is running", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = {
      ...snapshot.pets[0],
      agentTask: { status: "working", label: null },
    };

    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 0, y: 0, width: 1000, height: 800 },
      7,
    );

    expect(projection.frame.sprite.working).toBe(true);
  });

  it("does not flag the frame sprite as working when idle", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = { ...snapshot.pets[0], agentTask: null };

    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 0, y: 0, width: 1000, height: 800 },
      7,
    );

    expect(projection.frame.sprite.working).toBe(false);
  });

  it("passes the session partner name through to the frame sprite", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = {
      ...snapshot.pets[0],
      activity: "chatting",
      social: {
        kind: "chat",
        phase: "play",
        role: "initiator",
        partnerId: "pet-b",
        partnerName: "Otto",
      },
    };

    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 0, y: 0, width: 1000, height: 800 },
      7,
    );

    expect(projection.frame.sprite.partnerName).toBe("Otto");
  });

  it("prefers expression emotes over behavior decision emotes", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = {
      ...snapshot.pets[0],
      decision: {
        source: "autonomous",
        reason: "request-jump",
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

  it("suppresses behavior decision emotes for active quiet expressions", () => {
    const snapshot = snapshotFixture();
    snapshot.pets[0] = {
      ...snapshot.pets[0],
      decision: {
        source: "autonomous",
        reason: "request-jump",
        decidedAt: 100,
      },
      expression: {
        source: "collision",
        mood: "working",
        emote: "none",
        label: null,
        startedAt: 120,
        expiresAt: 820,
      },
    };

    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 0, y: 0, width: 1000, height: 800 },
      7,
    );

    expect(projection.frame.sprite.decisionEmote).toBeNull();
  });

  it("maps playground x coordinates across the full desktop projection width", () => {
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshotFixture(),
      { x: 100, y: 200, width: 1920, height: 540 },
      12,
    );

    expect(projection.frame.window.x).toBe(1204);
    expect(projection.frame.window.y).toBe(543);
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
    expect(projection.frame.window.y).toBe(283);
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

  it("keeps a full-size (scale 1) pet's window position unchanged", () => {
    // Scale 1 is the size the projection was originally tuned at; the fixed-
    // window fix must be a no-op here so full-size pets keep sitting correctly.
    const snapshot: WorldSnapshot = {
      ...snapshotFixture(),
      viewport: { x: 0, y: 0, width: 960, height: 540 },
    };
    const [projection] = projectWorldSnapshotToPetWindows(
      snapshot,
      { x: 100, y: 200, width: 960, height: 540 },
      1,
      { "pet-a": 1 },
    );
    // bounds.x(100) + body.x(600) - osWindowWidth/2(96) = 604
    expect(projection.frame.window.x).toBe(604);
    // bounds.y(200) + body.y(500) - 134 - 60 - 16 + 30 = 520
    expect(projection.frame.window.y).toBe(520);
    expect(projection.frame.window.width).toBe(192);
    expect(projection.frame.window.height).toBe(268);
  });

  it("lands a resting pet's feet on the floor consistently at every scale", () => {
    // The OS pet window is a fixed 192×268; the scaled sprite frame is centred
    // inside it (place-items:center). Model that centring here and confirm the
    // rendered feet sit the same proportional distance from the floor at every
    // scale — otherwise the default min-scale (0.5) pet sinks while a full-size
    // pet sits correctly, which is the bug this guards.
    const OS_WINDOW_HEIGHT = 268; // PET_CELL_SIZE.height(208) + bubble(60)
    const FEET_IN_FRAME = 250; // body.y(94) + body.height(156), unscaled
    const floorWorldY = 1000;

    const feetGapPerScale = (scale: number) => {
      const bodyHeight = 156 * scale; // adopted body scales with the sprite
      const snapshot: WorldSnapshot = {
        ...snapshotFixture(),
        width: 1920,
        height: 1080,
        viewport: { x: 0, y: 0, width: 1920, height: 1080 },
        bodies: [
          {
            ...snapshotFixture().bodies[0],
            y: floorWorldY - bodyHeight / 2, // body bottom rests on the floor
            height: bodyHeight,
          },
        ],
      };
      const [projection] = projectWorldSnapshotToPetWindows(
        snapshot,
        { x: 0, y: 0, width: 1920, height: 1080 },
        1,
        { "pet-a": scale },
      );
      const frameHeight = OS_WINDOW_HEIGHT * scale;
      const centeringOffsetY = (OS_WINDOW_HEIGHT - frameHeight) / 2;
      const feetScreenY = projection.frame.window.y + centeringOffsetY + FEET_IN_FRAME * scale;
      return (feetScreenY - floorWorldY) / scale;
    };

    // The feet-to-floor gap is a pure multiple of scale, so dividing it out is
    // the same constant for every size.
    expect(feetGapPerScale(0.5)).toBeCloseTo(feetGapPerScale(1), 6);
    expect(feetGapPerScale(1)).toBeCloseTo(feetGapPerScale(0.75), 6);
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
