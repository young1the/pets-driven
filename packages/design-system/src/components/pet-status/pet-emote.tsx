import type { CSSProperties, HTMLAttributes } from "react";
import type { PetEmoteKind } from "./pet-mood";
import "./pet-status.css";

/**
 * The floating corner emote for a desktop pet (hearts / zzz / sparkles /
 * "?" / "!"). Pointer-transparent; the consumer absolutely positions the
 * root at the pet's top-right.
 */
export interface PetEmoteProps extends HTMLAttributes<HTMLDivElement> {
  kind: PetEmoteKind;
  /** Compact size. @default "md" */
  size?: "sm" | "md";
  /** Accent for the "?"/"!" bubblet (CSS color). */
  accent?: string;
}

function HeartSvg() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M12 21s-7-4.6-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 3.4C19 16.4 12 21 12 21z"
        fill="var(--color-primary)"
      />
    </svg>
  );
}

function SparkSvg() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"
        fill="var(--color-accent)"
      />
    </svg>
  );
}

export function PetEmote({
  kind,
  size = "md",
  accent,
  className = "",
  style,
  ...rest
}: PetEmoteProps) {
  if (kind === "none") {
    return null;
  }

  const cls = ["pd-emote", size === "sm" ? "pd-emote--sm" : "", className]
    .filter(Boolean)
    .join(" ");
  const rootStyle = accent ? ({ "--comp-accent": accent, ...style } as CSSProperties) : style;

  return (
    <div aria-hidden="true" className={cls} style={rootStyle} {...rest}>
      {kind === "heart" && (
        <>
          <span className="pd-emote__heart">
            <HeartSvg />
          </span>
          <span className="pd-emote__heart pd-emote__heart--2">
            <HeartSvg />
          </span>
          <span className="pd-emote__heart pd-emote__heart--3">
            <HeartSvg />
          </span>
        </>
      )}
      {kind === "zzz" && (
        <>
          <span className="pd-emote__z pd-emote__z--1">z</span>
          <span className="pd-emote__z pd-emote__z--2">z</span>
          <span className="pd-emote__z pd-emote__z--3">Z</span>
        </>
      )}
      {kind === "sparkle" && (
        <>
          <span className="pd-emote__spark pd-emote__spark--1">
            <SparkSvg />
          </span>
          <span className="pd-emote__spark pd-emote__spark--2">
            <SparkSvg />
          </span>
        </>
      )}
      {kind === "question" && <span className="pd-emote__bubblet">?</span>}
      {kind === "exclaim" && <span className="pd-emote__bubblet">!</span>}
    </div>
  );
}
