import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  animationStateFromSpriteIntent,
  type PetSpriteIntent,
} from "@/pets/rendering/pet-sprite-intent";
import { resolvePetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";
import { drawPetSpriteCanvas, type AssetCatalog } from "@/pets/rendering/pet-sprite-canvas";
import { PetSpriteHtml } from "@/pets/rendering/pet-sprite-html";

describe("pet sprite rendering", () => {
  it("maps semantic travel and working intents to hatch-pet atlas states", () => {
    expect(animationStateFromSpriteIntent({ kind: "travel", direction: "right" })).toBe("running-right");
    expect(animationStateFromSpriteIntent({ kind: "travel", direction: "left" })).toBe("running-left");
    expect(animationStateFromSpriteIntent({ kind: "working" })).toBe("running");
  });

  it("maps direct status intents to matching hatch-pet atlas states", () => {
    const statuses: PetSpriteIntent[] = [
      { kind: "idle" },
      { kind: "waving" },
      { kind: "jumping" },
      { kind: "failed" },
      { kind: "waiting" },
      { kind: "review" },
    ];

    expect(statuses.map(animationStateFromSpriteIntent)).toEqual([
      "idle",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "review",
    ]);
  });

  it("resolves semantic intent to source rectangle and draw size", () => {
    expect(resolvePetSpriteFrame({
      intent: { kind: "travel", direction: "right" },
      elapsedMs: 0,
      size: { width: 32, height: 38 },
    })).toMatchObject({
      animationState: "running-right",
      frameIndex: 0,
      rowIndex: 1,
      source: { x: 0, y: 208, width: 192, height: 208 },
      drawSize: { width: 32, height: 38 },
      mirror: false,
    });
  });

  it("defaults the animation-state input variant to idle", () => {
    expect(resolvePetSpriteFrame({
      elapsedMs: 0,
      size: { width: 32, height: 38 },
    })).toMatchObject({
      animationState: "idle",
      frameIndex: 0,
      rowIndex: 0,
      source: { x: 0, y: 0, width: 192, height: 208 },
      drawSize: { width: 32, height: 38 },
    });
  });

  it("scales draw size without changing atlas source size", () => {
    expect(resolvePetSpriteFrame({
      animationState: "waiting",
      elapsedMs: 320,
      size: { width: 40, height: 50 },
      scale: 1.12,
    })).toMatchObject({
      animationState: "waiting",
      frameIndex: 2,
      rowIndex: 6,
      source: { x: 384, y: 1248, width: 192, height: 208 },
      drawSize: { width: 44.8, height: 56 },
    });
  });

  it("mirrors only single-direction states when facing right", () => {
    expect(resolvePetSpriteFrame({
      animationState: "jumping",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    }).mirror).toBe(true);

    expect(resolvePetSpriteFrame({
      animationState: "running-right",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    }).mirror).toBe(false);

    expect(resolvePetSpriteFrame({
      intent: { kind: "working" },
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    }).mirror).toBe(false);
  });

  it("draws resolved frames on canvas and applies mirror around center", () => {
    const context = {
      drawImage: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
    };
    const canvasContext = context as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;
    const frame = resolvePetSpriteFrame({
      animationState: "jumping",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    });

    drawPetSpriteCanvas(canvasContext, image, frame, { x: 100, y: 80 });

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

  it("restores canvas state when mirrored drawing throws", () => {
    const context = {
      drawImage: vi.fn(() => { throw new Error("bad image"); }),
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
    };
    const canvasContext = context as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;
    const frame = resolvePetSpriteFrame({
      animationState: "jumping",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    });

    expect(() => drawPetSpriteCanvas(canvasContext, image, frame, { x: 100, y: 80 })).toThrow("bad image");
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it("renders a resolved frame as clipped HTML", () => {
    const frame = resolvePetSpriteFrame({
      animationState: "waiting",
      elapsedMs: 320,
      facing: "right",
      size: { width: 32, height: 38 },
    });

    render(
      <PetSpriteHtml
        alt="Waiting pet"
        frame={frame}
        imageUrl="/fallback-pets/patamon/spritesheet.webp"
      />,
    );

    const root = screen.getByLabelText("Waiting pet");

    expect(root).toHaveStyle({
      width: "32px",
      height: "38px",
      overflow: "hidden",
      backgroundImage: "url(/fallback-pets/patamon/spritesheet.webp)",
      backgroundPosition: "-64px -228px",
      backgroundSize: "256px 342px",
      transform: "scaleX(-1)",
    });
  });
});
