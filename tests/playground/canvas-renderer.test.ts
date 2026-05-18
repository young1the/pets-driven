import { describe, expect, it, vi } from "vitest";
import { drawWorld } from "@/playground/browser/canvas-renderer";

describe("canvas renderer", () => {
  it("draws fallback bodies when no asset catalog is supplied", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [{ id: "pet-a", x: 100, y: 80, vx: 1, vy: 0, radius: 16 }],
        pets: [],
      },
      {},
    );

    expect(context.arc).toHaveBeenCalledWith(100, 80, 16, 0, Math.PI * 2);
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
            radius: 16,
            animationState: "waiting",
          },
        ],
        pets: [],
      },
      { "pet-a": image },
      320,
    );

    expect(context.drawImage).toHaveBeenCalledWith(image, 384, 1248, 192, 208, 52, 28, 96, 104);
  });

  it("draws pet names and intents from the world snapshot", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [{ id: "pet-a", x: 100, y: 120, vx: 1, vy: 0, radius: 16 }],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "seek-user",
            speech: null,
            position: { x: 100, y: 120 },
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillText).toHaveBeenCalledWith("Alice", 100, 88);
    expect(context.fillText).toHaveBeenCalledWith("seek-user", 100, 104);
  });

  it("draws speech when a pet has speech", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
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
        bodies: [{ id: "pet-a", x: 100, y: 120, vx: 1, vy: 0, radius: 16 }],
        pets: [
          {
            id: "pet-a",
            sourceId: "agent-a",
            name: "Alice",
            intent: "seek-user",
            speech: "Needs approval",
            position: { x: 100, y: 120 },
          },
        ],
      },
      {},
      0,
    );

    expect(context.fillText).toHaveBeenCalledWith("Needs approval", 100, 72);
  });
});
