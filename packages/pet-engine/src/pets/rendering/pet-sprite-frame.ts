import {
  getAtlasFrame,
  PET_CELL_SIZE,
  type PetAnimationState,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";

export type PetSpriteSize = {
  width: number;
  height: number;
};

export type PetSpriteFrameInput = {
  animationState?: PetAnimationState;
  elapsedMs: number;
  size: PetSpriteSize;
  scale?: number;
};

export type PetSpriteFrame = {
  animationState: PetAnimationState;
  frameIndex: number;
  rowIndex: number;
  source: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  drawSize: PetSpriteSize;
};

export function resolvePetSpriteFrame(input: PetSpriteFrameInput): PetSpriteFrame {
  const animationState = input.animationState ?? "idle";
  const atlasFrame = getAtlasFrame(animationState, input.elapsedMs);
  const scale = input.scale ?? 1;

  return {
    animationState,
    frameIndex: atlasFrame.frameIndex,
    rowIndex: atlasFrame.rowIndex,
    source: {
      x: atlasFrame.sourceX,
      y: atlasFrame.sourceY,
      width: PET_CELL_SIZE.width,
      height: PET_CELL_SIZE.height,
    },
    drawSize: {
      width: normalizeSpriteDimension(input.size.width * scale),
      height: normalizeSpriteDimension(input.size.height * scale),
    },
  };
}

function normalizeSpriteDimension(value: number) {
  return Number(value.toFixed(10));
}
