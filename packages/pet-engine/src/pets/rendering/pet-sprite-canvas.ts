import type { PetSpriteFrame } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-frame";

export type AssetCatalog = Record<string, HTMLImageElement>;

export type PetSpriteCanvasPosition = {
  x: number;
  y: number;
};

export function drawPetSpriteCanvas(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: PetSpriteFrame,
  position: PetSpriteCanvasPosition,
) {
  context.drawImage(
    image,
    frame.source.x,
    frame.source.y,
    frame.source.width,
    frame.source.height,
    position.x - frame.drawSize.width / 2,
    position.y - frame.drawSize.height / 2,
    frame.drawSize.width,
    frame.drawSize.height,
  );
}
