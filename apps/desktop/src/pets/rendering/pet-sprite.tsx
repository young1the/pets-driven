import type { CSSProperties } from "react";
import {
  type PetAnimationState,
  type PetSpriteFacing,
} from "@/pets/assets/pet-atlas";
import {
  resolvePetSpriteFrame,
  type PetSpriteSize,
} from "@/pets/rendering/pet-sprite-frame";
import { PetSpriteHtml } from "@/pets/rendering/pet-sprite-html";
import type { PetSpriteIntent } from "@/pets/rendering/pet-sprite-intent";

export type PetSpriteOverlay = {
  kind: "attention" | "speech" | "status";
  label: string;
};

type PetSpriteBaseProps = {
  alt: string;
  className?: string;
  elapsedMs: number;
  imageUrl: string;
  overlay?: PetSpriteOverlay | null;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  scale?: number;
  size: PetSpriteSize;
  spriteClassName?: string;
  spriteStyle?: CSSProperties;
  style?: CSSProperties;
};

type PetSpriteIntentProps = PetSpriteBaseProps & {
  animationState?: never;
  facing?: never;
  intent: PetSpriteIntent;
};

type PetSpriteAnimationProps = PetSpriteBaseProps & {
  animationState?: PetAnimationState;
  facing?: PetSpriteFacing;
  intent?: never;
};

export type PetSpriteProps = PetSpriteIntentProps | PetSpriteAnimationProps;

const PET_SPRITE_OVERLAY_RECT = {
  x: 54,
  y: 12,
  width: 84,
  height: 28,
};

export function PetSprite({
  alt,
  className,
  elapsedMs,
  imageUrl,
  overlay,
  overlayClassName,
  overlayStyle,
  scale,
  size,
  spriteClassName,
  spriteStyle,
  style,
  ...frameInput
}: PetSpriteProps) {
  const frame = resolvePetSpriteFrame({
    ...frameInput,
    elapsedMs,
    scale,
    size,
  });

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        height: `${frame.drawSize.height}px`,
        position: "relative",
        width: `${frame.drawSize.width}px`,
        ...style,
      }}
    >
      <PetSpriteHtml
        alt={alt}
        className={spriteClassName}
        frame={frame}
        imageUrl={imageUrl}
        style={spriteStyle}
      />
      {overlay ? (
        <span
          aria-label={`Pet ${overlay.kind} overlay`}
          className={overlayClassName}
          style={{
            background: "#ffffff",
            border: "1px solid #2563eb",
            boxSizing: "border-box",
            color: "#172033",
            font: "bold 16px Inter, Arial, sans-serif",
            height: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.height, frame)}px`,
            left: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.x, frame)}px`,
            lineHeight: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.height, frame) - 2}px`,
            pointerEvents: "none",
            position: "absolute",
            textAlign: "center",
            top: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.y, frame)}px`,
            width: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.width, frame)}px`,
            zIndex: 1,
            ...overlayStyle,
          }}
        >
          {overlay.label}
        </span>
      ) : null}
    </span>
  );
}

function scaleOverlayValue(
  value: number,
  frame: ReturnType<typeof resolvePetSpriteFrame>,
) {
  return Number((value * (frame.drawSize.width / frame.source.width)).toFixed(10));
}
