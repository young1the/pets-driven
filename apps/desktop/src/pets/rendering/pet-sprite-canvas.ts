import type { PetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";

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
  if (frame.mirror) {
    context.save();
    try {
      context.translate(position.x, position.y);
      context.scale(-1, 1);
      context.drawImage(
        image,
        frame.source.x,
        frame.source.y,
        frame.source.width,
        frame.source.height,
        -frame.drawSize.width / 2,
        -frame.drawSize.height / 2,
        frame.drawSize.width,
        frame.drawSize.height,
      );
    } finally {
      context.restore();
    }
    return;
  }

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
