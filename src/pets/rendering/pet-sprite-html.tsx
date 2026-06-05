import { PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import type { PetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";
import type { CSSProperties } from "react";

type PetSpriteHtmlProps = {
  imageUrl: string;
  frame: PetSpriteFrame;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

export function PetSpriteHtml({
  imageUrl,
  frame,
  alt,
  className,
  style,
}: PetSpriteHtmlProps) {
  const scaleX = frame.drawSize.width / frame.source.width;
  const scaleY = frame.drawSize.height / frame.source.height;
  const backgroundWidth = PET_CELL_SIZE.width * 8 * scaleX;
  const backgroundHeight = PET_CELL_SIZE.height * 9 * scaleY;

  return (
    <span
      aria-label={alt}
      className={className}
      style={{
        ...style,
        backgroundImage: `url(${imageUrl})`,
        backgroundPosition: `${-frame.source.x * scaleX}px ${-frame.source.y * scaleY}px`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${backgroundWidth}px ${backgroundHeight}px`,
        display: "inline-block",
        height: `${frame.drawSize.height}px`,
        overflow: "hidden",
        transform: frame.mirror ? "scaleX(-1)" : undefined,
        transformOrigin: "center",
        width: `${frame.drawSize.width}px`,
      }}
    />
  );
}
