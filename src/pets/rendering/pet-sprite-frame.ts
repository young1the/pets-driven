import {
  getAtlasFrame,
  PET_CELL_SIZE,
  shouldMirrorSprite,
  type PetAnimationState,
  type PetSpriteFacing,
} from "@/pets/assets/pet-atlas";
import {
  animationStateFromSpriteIntent,
  facingFromSpriteIntent,
  type PetSpriteIntent,
} from "@/pets/rendering/pet-sprite-intent";

export type PetSpriteSize = {
  width: number;
  height: number;
};

type PetSpriteFrameBaseInput = {
  elapsedMs: number;
  facing?: PetSpriteFacing;
  size: PetSpriteSize;
  scale?: number;
};

type PetSpriteIntentFrameInput = PetSpriteFrameBaseInput & {
  intent: PetSpriteIntent;
  animationState?: never;
};

type PetSpriteAnimationFrameInput = PetSpriteFrameBaseInput & {
  animationState?: PetAnimationState;
  intent?: never;
};

export type PetSpriteFrameInput =
  | PetSpriteIntentFrameInput
  | PetSpriteAnimationFrameInput;

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
  mirror: boolean;
};

export function resolvePetSpriteFrame(
  input: PetSpriteFrameInput,
): PetSpriteFrame {
  const animationState =
    input.intent
      ? animationStateFromSpriteIntent(input.intent)
      : input.animationState ?? "idle";
  const facing =
    input.facing ?? (input.intent ? facingFromSpriteIntent(input.intent) : undefined);
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
    mirror: shouldMirrorSprite(animationState, facing),
  };
}

function normalizeSpriteDimension(value: number) {
  return Number(value.toFixed(10));
}
