import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { PET_MOODS, type PetMood } from "./pet-mood";
import "./pet-status.css";

/**
 * The desktop pet's speech bubble: work status label +
 * mood face + a line of dialogue, with a tail pointing down at the sprite.
 */
export interface PetSpeechBubbleProps extends HTMLAttributes<HTMLDivElement> {
  /** Mood drives accent color and face. @default "working" */
  mood?: PetMood;
  /** Work status label; falls back to the mood's default. */
  work?: string;
  /** The spoken line. */
  message?: ReactNode;
  /** Show the mood face emoji. @default true */
  showFace?: boolean;
  /** Play the pop-in entrance. @default false */
  animateIn?: boolean;
}

export function PetSpeechBubble({
  mood = "working",
  work,
  message,
  showFace = true,
  animateIn = false,
  className = "",
  style,
  ...rest
}: PetSpeechBubbleProps) {
  const spec = PET_MOODS[mood] ?? PET_MOODS.working;
  const cls = ["pd-bubble", animateIn ? "pd-bubble--animate-in" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{ "--comp-accent": spec.accent, ...style } as CSSProperties}
      {...rest}
    >
      <div className="pd-bubble__statusrow">
        <span className="pd-bubble__work">{work ?? spec.defaultLabel}</span>
        {showFace && (
          <span aria-label={mood} className="pd-bubble__mood" role="img">
            {spec.face}
          </span>
        )}
      </div>
      {message && <div className="pd-bubble__msg">{message}</div>}
    </div>
  );
}
