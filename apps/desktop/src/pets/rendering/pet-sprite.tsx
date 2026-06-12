import type { CSSProperties } from "react";
import { PetEmote, PetStatusCapsule } from "@pets-driven/design-system";
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
import { presentPetStatus } from "@/pets/rendering/pet-status-presentation";

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

const PET_SPRITE_EMOTE_OFFSET = {
  top: 8,
  right: 14,
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
  const status = presentPetStatus(frameInput.intent, overlay);
  const drawScale = frame.drawSize.width / frame.source.width;

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
      {overlay && status.showCapsule ? (
        <span
          aria-label={`Pet ${overlay.kind} overlay`}
          className={overlayClassName}
          style={{
            boxSizing: "border-box",
            display: "block",
            height: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.height, frame)}px`,
            left: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.x, frame)}px`,
            pointerEvents: "none",
            position: "absolute",
            top: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.y, frame)}px`,
            width: `${scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.width, frame)}px`,
            zIndex: 1,
            ...overlayStyle,
          }}
        >
          <span
            style={{
              display: "flex",
              justifyContent: "center",
              transform: `scale(${drawScale})`,
              transformOrigin: "top center",
              width: `${PET_SPRITE_OVERLAY_RECT.width}px`,
              marginLeft: `${(scaleOverlayValue(PET_SPRITE_OVERLAY_RECT.width, frame) - PET_SPRITE_OVERLAY_RECT.width) / 2}px`,
            }}
          >
            <PetStatusCapsule
              label={status.label ?? undefined}
              mood={status.mood}
              size="sm"
              style={{ maxWidth: `${PET_SPRITE_OVERLAY_RECT.width}px` }}
            />
          </span>
        </span>
      ) : null}
      {status.emote !== "none" ? (
        <span
          aria-hidden="true"
          style={{
            pointerEvents: "none",
            position: "absolute",
            right: `${scaleOverlayValue(PET_SPRITE_EMOTE_OFFSET.right, frame)}px`,
            top: `${scaleOverlayValue(PET_SPRITE_EMOTE_OFFSET.top, frame)}px`,
            transform: `scale(${drawScale})`,
            transformOrigin: "top right",
            zIndex: 2,
          }}
        >
          <PetEmote kind={status.emote} size="sm" />
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
