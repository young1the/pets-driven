import type { CSSProperties } from "react";
import { PetSpeechBubble } from "@pets-driven/design-system";
import { type PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import {
  resolvePetSpriteFrame,
  type PetSpriteSize,
} from "@pets-driven/pet-engine/pets/rendering/pet-sprite-frame";
import { PetSpriteHtml } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-html";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import type { BehaviorTokenPresentation } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import { BehaviorTokenEmote } from "@pets-driven/pet-engine/pets/rendering/behavior-token-emote";
import type { AgentChannelStatus } from "@pets-driven/pet-engine/features/agent/components";

export type PetSpriteOverlay =
  | {
      kind: "agent-channel";
      status: AgentChannelStatus;
      label: string;
      message: string | null;
    }
  | {
      kind: "attention" | "speech" | "status";
      label: string;
    };

export type PetSpriteProps = {
  alt: string;
  animationState?: PetAnimationState;
  className?: string;
  decisionEmote?: BehaviorTokenPresentation | null;
  elapsedMs: number;
  imageUrl: string;
  overlay?: PetSpriteOverlay | null;
  overlayClassName?: string;
  overlayStyle?: CSSProperties;
  scale?: number;
  showStatusBubble?: boolean;
  size: PetSpriteSize;
  spriteClassName?: string;
  spriteStyle?: CSSProperties;
  style?: CSSProperties;
};

const PET_SPRITE_OVERLAY_RECT = {
  x: 16,
  y: -52,
  width: 160,
  height: 52,
};

const PET_SPRITE_EMOTE_OFFSET = {
  top: 8,
  right: 14,
};

export function PetSprite({
  alt,
  className,
  decisionEmote,
  elapsedMs,
  imageUrl,
  overlay,
  overlayClassName,
  overlayStyle,
  scale,
  showStatusBubble = true,
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
  const status = presentPetStatus(frameInput.animationState, overlay);
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
      {status.showCapsule && showStatusBubble ? (
        <span
          aria-label={`Pet ${overlay?.kind ?? "status"} overlay`}
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
            <PetSpeechBubble
              mood={status.mood}
              message={status.message ?? undefined}
              work={status.label ?? undefined}
              style={{ maxWidth: `${PET_SPRITE_OVERLAY_RECT.width}px` }}
            />
          </span>
        </span>
      ) : null}
      {decisionEmote ? (
        <span
          style={{
            pointerEvents: "none",
            position: "absolute",
            right: `${scaleOverlayValue(PET_SPRITE_EMOTE_OFFSET.right, frame)}px`,
            top: `${scaleOverlayValue(PET_SPRITE_EMOTE_OFFSET.top, frame)}px`,
            transform: `scale(${drawScale})`,
            transformOrigin: "top right",
            zIndex: 3,
          }}
        >
          <BehaviorTokenEmote presentation={decisionEmote} />
        </span>
      ) : null}
    </span>
  );
}

function scaleOverlayValue(
  value: number,
  frame: ReturnType<typeof resolvePetSpriteFrame>,
) {
  return Number(
    (value * (frame.drawSize.width / frame.source.width)).toFixed(10),
  );
}
