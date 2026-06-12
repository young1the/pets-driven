import type { CSSProperties, HTMLAttributes } from "react";
import { PET_MOODS, type PetMood } from "./pet-mood";
import "./pet-status.css";

/**
 * The status-only pill shown near a desktop pet sprite: pulsing accent dot +
 * uppercase work label + mood face. Art-agnostic — the consumer positions it
 * relative to its own sprite.
 */
export interface PetStatusCapsuleProps extends HTMLAttributes<HTMLDivElement> {
  /** Mood drives accent color, face and default label. @default "working" */
  mood?: PetMood;
  /** Work label; falls back to the mood's default (e.g. "Napping"). */
  label?: string;
  /** Show the mood face emoji. @default true */
  showFace?: boolean;
  /** Compact size. @default "md" */
  size?: "sm" | "md";
  /** Pulse the status dot. @default true */
  live?: boolean;
}

export function PetStatusCapsule({
  mood = "working",
  label,
  showFace = true,
  size = "md",
  live = true,
  className = "",
  style,
  ...rest
}: PetStatusCapsuleProps) {
  const spec = PET_MOODS[mood] ?? PET_MOODS.working;
  const text = label ?? spec.defaultLabel;
  const cls = [
    "pd-capsule",
    size === "sm" ? "pd-capsule--sm" : "",
    live ? "pd-capsule--live" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{ "--comp-accent": spec.accent, ...style } as CSSProperties}
      {...rest}
    >
      <span className="pd-capsule__dot" />
      {text && <span className="pd-capsule__label">{text}</span>}
      {showFace && (
        <span aria-label={mood} className="pd-capsule__face" role="img">
          {spec.face}
        </span>
      )}
    </div>
  );
}
