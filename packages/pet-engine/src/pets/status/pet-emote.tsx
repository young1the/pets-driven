import type { CSSProperties, HTMLAttributes } from "react";
import type { PetEmoteKind } from "./pet-mood";
import "./pet-status.css";

/**
 * The floating corner emote for a desktop pet (hearts / zzz / sparkles /
 * "?" / "!" / ♪ / sweat / "···"). Pointer-transparent; the consumer absolutely
 * positions the root at the pet's top-right.
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
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 21s-7-4.6-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 3.4C19 16.4 12 21 12 21z"
        fill="var(--color-primary)"
      />
    </svg>
  );
}

function SparkSvg() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"
        fill="var(--color-accent)"
      />
    </svg>
  );
}

function NoteSvg() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M11 4h2v10.6a3.4 3.4 0 1 1-2-3.1V4zm2 0h6v2h-6V4z" fill="var(--comp-accent)" />
    </svg>
  );
}

function SweatSvg() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3c3.4 4.2 5.4 7.1 5.4 9.4a5.4 5.4 0 1 1-10.8 0C6.6 10.1 8.6 7.2 12 3z"
        fill="var(--sky-400)"
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
      {kind === "note" && (
        <>
          <span className="pd-emote__note pd-emote__note--1">
            <NoteSvg />
          </span>
          <span className="pd-emote__note pd-emote__note--2">
            <NoteSvg />
          </span>
        </>
      )}
      {kind === "sweat" && (
        <span className="pd-emote__sweat">
          <SweatSvg />
        </span>
      )}
      {kind === "dots" && (
        <>
          <span className="pd-emote__dot pd-emote__dot--1" />
          <span className="pd-emote__dot pd-emote__dot--2" />
          <span className="pd-emote__dot pd-emote__dot--3" />
        </>
      )}
      {kind === "question" && <span className="pd-emote__bubblet">?</span>}
      {kind === "exclaim" && <span className="pd-emote__bubblet">!</span>}
    </div>
  );
}
