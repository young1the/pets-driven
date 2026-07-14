import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolvePetSpriteFrame } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-frame";
import { drawPetSpriteCanvas } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";
import { PetSpriteHtml } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-html";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";

describe("pet sprite rendering", () => {
  it("resolves an animation row to its source rectangle and draw size", () => {
    expect(
      resolvePetSpriteFrame({
        animationState: "running-right",
        elapsedMs: 0,
        size: { width: 32, height: 38 },
      }),
    ).toMatchObject({
      animationState: "running-right",
      frameIndex: 0,
      rowIndex: 1,
      source: { x: 0, y: 208, width: 192, height: 208 },
      drawSize: { width: 32, height: 38 },
    });
  });

  it("defaults the animation-state input to idle", () => {
    expect(
      resolvePetSpriteFrame({
        elapsedMs: 0,
        size: { width: 32, height: 38 },
      }),
    ).toMatchObject({
      animationState: "idle",
      frameIndex: 0,
      rowIndex: 0,
      source: { x: 0, y: 0, width: 192, height: 208 },
      drawSize: { width: 32, height: 38 },
    });
  });

  it("scales draw size without changing atlas source size", () => {
    expect(
      resolvePetSpriteFrame({
        animationState: "waiting",
        elapsedMs: 320,
        size: { width: 40, height: 50 },
        scale: 1.12,
      }),
    ).toMatchObject({
      animationState: "waiting",
      frameIndex: 2,
      rowIndex: 6,
      source: { x: 384, y: 1248, width: 192, height: 208 },
      drawSize: { width: 44.8, height: 56 },
    });
  });

  it("draws a resolved frame on canvas at the body center", () => {
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
      size: { width: 32, height: 38 },
    });

    drawPetSpriteCanvas(canvasContext, image, frame, { x: 100, y: 80 });

    expect(context.scale).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 832, 192, 208, 84, 61, 32, 38);
  });

  it("renders a resolved frame as clipped HTML", () => {
    const frame = resolvePetSpriteFrame({
      animationState: "waiting",
      elapsedMs: 320,
      size: { width: 32, height: 38 },
    });

    render(
      <PetSpriteHtml
        alt="Waiting pet"
        frame={frame}
        imageUrl="/fallback-pets/bloop/spritesheet.webp"
      />,
    );

    const root = screen.getByLabelText("Waiting pet");

    expect(root).toHaveStyle({
      width: "32px",
      height: "38px",
      overflow: "hidden",
      backgroundImage: "url(/fallback-pets/bloop/spritesheet.webp)",
      backgroundPosition: "-64px -228px",
      backgroundSize: "256px 342px",
    });
  });

  it("renders a props-driven pet sprite with overlay from the pets package", () => {
    render(
      <PetSprite
        alt="Promo pet"
        animationState="waiting"
        decisionEmote={{ emote: "sparkle", label: "Jump request", mood: "excited", tone: "spark" }}
        elapsedMs={320}
        imageUrl="/fallback-pets/bloop/spritesheet.webp"
        overlay={{ kind: "attention", label: "WAIT" }}
        size={{ width: 96, height: 104 }}
      />,
    );

    const sprite = screen.getByLabelText("Promo pet");
    const overlay = screen.getByLabelText("Pet attention overlay");
    const decisionEmote = screen.getByLabelText("Decision token Jump request");

    expect(sprite).toHaveStyle({
      width: "96px",
      height: "104px",
      backgroundImage: "url(/fallback-pets/bloop/spritesheet.webp)",
      backgroundPosition: "-192px -624px",
      backgroundSize: "768px 936px",
    });
    expect(overlay).toHaveTextContent("WAIT");
    expect(decisionEmote.querySelector(".pd-emote")).not.toBeNull();
  });
});
