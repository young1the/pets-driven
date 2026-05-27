import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PET_BODY_SIZE } from "@/pets/constants/pet-body";
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
            interaction: { dragged: true, scale: 1.12 },
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
      100 - (40 * 1.12) / 2,
      120 - (50 * 1.12) / 2,
      40 * 1.12,
      50 * 1.12,
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

    expect(context.fillText).toHaveBeenCalledWith("♥", 100, 72);
  });

  it("draws visual behavior cues above speech bubbles", () => {
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

    expect(context.fillText).toHaveBeenCalledWith("!", 100, 40);
    expect(context.fillText).toHaveBeenCalledWith("Needs approval", 100, 72);
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
});
