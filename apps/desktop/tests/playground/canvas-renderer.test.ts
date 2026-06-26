import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PET_BODY_SIZE } from "@pets-driven/pet-engine/pets/constants/pet-body";
import { drawWorld } from "@/playground/browser/canvas-renderer";

describe("canvas renderer", () => {
  it("draws fallback bodies when no asset catalog is supplied", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 80,
            vx: 1,
            vy: 0,
            shape: "rectangle",
            ...DEFAULT_PET_BODY_SIZE,
          },
        ],
        pets: [],
        climbableSurfaces: [],
      },
      {},
    );

    expect(context.rect).toHaveBeenCalledWith(84, 61, 32, 38);
    expect(context.arc).not.toHaveBeenCalled();
  });

  it("draws a sprite when an asset exists for a body", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const image = {} as HTMLImageElement;

    drawWorld(
      context as unknown as CanvasRenderingContext2D,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 80,
            vx: 1,
            vy: 0,
            shape: "rectangle",
            ...DEFAULT_PET_BODY_SIZE,
            animationState: "waiting",
          },
        ],
        pets: [],
        climbableSurfaces: [],
      },
      { "pet-a": image },
      320,
    );

    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      384,
      1248,
      192,
      208,
      84,
      61,
      32,
      38,
    );
  });

  it("scales dragged pet sprites around their center", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 120,
            vx: 0,
            vy: 0,
            shape: "rectangle",
            width: 40,
            height: 50,
            animationState: "idle",
            interaction: { controllable: true, dragged: true, scale: 1.12 },
          },
        ],
        pets: [],
        climbableSurfaces: [],
      },
      { "pet-a": image },
      0,
    );

    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      0,
      0,
      192,
      208,
      expect.closeTo(77.6),
      expect.closeTo(92),
      expect.closeTo(44.8),
      expect.closeTo(56),
    );
    expect(context.strokeRect).toHaveBeenCalledWith(
      expect.closeTo(73.6),
      expect.closeTo(88),
      expect.closeTo(52.8),
      expect.closeTo(64),
    );
  });

  it("draws a subtle outline around controllable pet sprites", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 120,
            vx: 0,
            vy: 0,
            shape: "rectangle",
            width: 40,
            height: 50,
            animationState: "idle",
            interaction: { controllable: true },
          },
        ],
        pets: [],
        climbableSurfaces: [],
      },
      { "pet-a": image },
      0,
    );

    expect(context.strokeRect).toHaveBeenCalledWith(76, 91, 48, 58);
  });

  it("draws a badge and strong outline for held agent states", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 120,
            vx: 0,
            vy: 0,
            shape: "rectangle",
            width: 40,
            height: 50,
            animationState: "waiting",
          },
        ],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "idle",
            locomotion: "walk",
            speech: null,
            position: { x: 100, y: 120 },
            contact: { grounded: false, climbableSurfaceId: null },
            motionTarget: null,
            decision: null,
            pendingReaction: null,
            agentTask: { status: "waiting", label: "WAIT" },
          },
        ],
        climbableSurfaces: [],
      },
      { "pet-a": image },
      0,
    );

    expect(context.strokeRect).toHaveBeenCalledWith(73, 88, 54, 64);
    expect(context.fillText).toHaveBeenCalledWith("WAIT", 100, 80);
  });

  it("mirrors right-facing jumping sprites around the body center", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    };
    const image = {} as HTMLImageElement;

    drawWorld(
      context as unknown as CanvasRenderingContext2D,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 80,
            vx: -1,
            vy: -3,
            shape: "rectangle",
            ...DEFAULT_PET_BODY_SIZE,
            animationState: "jumping",
            spriteFacing: "right",
          },
        ],
        pets: [],
        climbableSurfaces: [],
      },
      { "pet-a": image },
      0,
    );

    expect(context.save).toHaveBeenCalledBefore(context.scale);
    expect(context.translate).toHaveBeenCalledWith(100, 80);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      0,
      832,
      192,
      208,
      -16,
      -19,
      32,
      38,
    );
    expect(context.restore).toHaveBeenCalledAfter(context.drawImage);
  });

  it("draws directional running rows without mirroring", () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 80,
            vx: 1,
            vy: 0,
            shape: "rectangle",
            ...DEFAULT_PET_BODY_SIZE,
            animationState: "running-right",
            spriteFacing: "right",
          },
        ],
        pets: [],
        climbableSurfaces: [],
      },
      { "pet-a": image },
      0,
    );

    expect(context.scale).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      0,
      208,
      192,
      208,
      84,
      61,
      32,
      38,
    );
  });

  it("draws pet names and intents from the world snapshot", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 120,
            vx: 1,
            vy: 0,
            shape: "rectangle",
            ...DEFAULT_PET_BODY_SIZE,
          },
        ],
        climbableSurfaces: [],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "seek-user",
            locomotion: "walk",
            speech: null,
            position: { x: 100, y: 120 },
            contact: { grounded: false, climbableSurfaceId: null },
            motionTarget: null,
            decision: null,
            pendingReaction: null,
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillText).toHaveBeenCalledWith("Alice", 100, 88);
    expect(context.fillText).toHaveBeenCalledWith("seek-user / walk", 100, 104);
    expect(context.fillText).not.toHaveBeenCalledWith("pet-a", 84, 96);
  });

  it("draws speech when a pet has speech", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [
          {
            id: "pet-a",
            x: 100,
            y: 120,
            vx: 1,
            vy: 0,
            shape: "rectangle",
            ...DEFAULT_PET_BODY_SIZE,
          },
        ],
        climbableSurfaces: [],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "seek-user",
            locomotion: "walk",
            speech: "Needs approval",
            position: { x: 100, y: 120 },
            contact: { grounded: false, climbableSurfaceId: null },
            motionTarget: null,
            decision: null,
            pendingReaction: null,
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillText).toHaveBeenCalledWith("Needs approval", 100, 72);
  });

  it("draws visual behavior cues above pets", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [],
        climbableSurfaces: [],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "idle",
            locomotion: "walk",
            speech: null,
            position: { x: 100, y: 120 },
            contact: { grounded: false, climbableSurfaceId: null },
            motionTarget: null,
            decision: null,
            pendingReaction: null,
            visualCue: {
              kind: "affection",
              icon: "♥",
              label: "approaching another pet",
            },
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillRect).toHaveBeenCalledWith(46, 56, 108, 20);
    expect(context.strokeRect).toHaveBeenCalledWith(46, 56, 108, 20);
    expect(context.fillText).toHaveBeenCalledWith("♥", 100, 72);
  });

  it("draws only the visual cue in the shared speech bubble when speech also exists", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [],
        climbableSurfaces: [],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "idle",
            locomotion: "walk",
            speech: "Needs approval",
            position: { x: 100, y: 120 },
            contact: { grounded: false, climbableSurfaceId: null },
            motionTarget: null,
            decision: null,
            pendingReaction: null,
            visualCue: {
              kind: "surprised",
              icon: "!",
              label: "surprised by collision",
            },
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillText).toHaveBeenCalledWith("!", 100, 72);
    expect(context.fillText).not.toHaveBeenCalledWith("Needs approval", 100, 72);
    expect(context.fillText).not.toHaveBeenCalledWith("! Needs approval", 100, 72);
    expect(context.fillText).not.toHaveBeenCalledWith("!", 100, 40);
  });

  it("draws a ground contact indicator under a grounded pet", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      ellipse: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [],
        climbableSurfaces: [],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "idle",
            locomotion: "walk",
            speech: null,
            position: { x: 100, y: 120 },
            contact: { grounded: true, climbableSurfaceId: null },
            motionTarget: null,
            decision: null,
            pendingReaction: null,
          },
        ],
      },
      {},
      0,
    );

    expect(context.ellipse).toHaveBeenCalledWith(
      100,
      127,
      12,
      4,
      0,
      0,
      Math.PI * 2,
    );
  });

  it("draws a motion target marker when a pet has a motion target", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [],
        climbableSurfaces: [],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "idle",
            locomotion: "walk",
            speech: null,
            position: { x: 100, y: 120 },
            contact: { grounded: false, climbableSurfaceId: null },
            motionTarget: { x: 200, y: 120 },
            decision: null,
            pendingReaction: null,
          },
        ],
      },
      {},
      0,
    );

    // X marker: two crossing lines at (200, 120)
    expect(context.moveTo).toHaveBeenCalledWith(194, 114);
    expect(context.lineTo).toHaveBeenCalledWith(206, 126);
  });

  it("draws climbable surfaces as visible playground markers", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [],
        pets: [],
        climbableSurfaces: [
          {
            id: "climb-wall",
            position: { x: 120, y: 90 },
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillRect).toHaveBeenCalledWith(108, 24, 24, 132);
    expect(context.strokeRect).toHaveBeenCalledWith(108, 24, 24, 132);
    expect(context.fillText).toHaveBeenCalledWith("CLIMB SPACE", 120, 48);
  });

  it("draws virtual desktop snapshots through the viewport transform", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      translate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 1600,
        height: 540,
        viewport: { x: -640, y: 0, width: 1600, height: 540 },
        monitors: [
          { id: "left", x: -640, y: 0, width: 640, height: 480 },
          { id: "primary", x: 0, y: 0, width: 960, height: 540 },
        ],
        bodies: [],
        pets: [],
        climbableSurfaces: [],
      },
      {},
      0,
    );

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1600, 540);
    expect(context.translate).toHaveBeenCalledWith(640, -0);
    expect(context.fillRect).toHaveBeenCalledWith(-640, 0, 640, 480);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 960, 540);
    expect(context.restore).toHaveBeenCalled();
  });
});
