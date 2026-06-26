import type { CSSProperties, HTMLAttributes } from "react";
import { PETS, PET_RINGS, PET_TINTS, type PetName } from "./pets";
import "./pet-avatar.css";

/**
 * PetAvatar — the brand's signature component. Renders one of the six pets in a
 * soft circular badge with an optional status ring and mood animation. The
 * sprite art is inlined as SVG, so the avatar is fully portable.
 */

export type PetAvatarSize = "sm" | "md" | "lg" | "xl";
export type PetAvatarStatus =
  | "idle"
  | "working"
  | "happy"
  | "thinking"
  | "napping"
  | "confused";

const STATUS_COLOR: Record<PetAvatarStatus, string> = {
  working: "var(--mint-500)",
  happy: "var(--mint-500)",
  thinking: "var(--sky-500)",
  napping: "var(--ink-400)",
  confused: "var(--butter-500)",
  idle: "var(--ink-300)",
};

export interface PetAvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "style"> {
  /** Which pet to show. @default "cato" */
  pet?: PetName;
  /** Badge size. @default "md" */
  size?: PetAvatarSize;
  /** Mood — drives the status-dot color and idle animation. @default "idle" */
  status?: PetAvatarStatus;
  /** Show a colored ring around the badge. @default false */
  ring?: boolean;
  /** Show a status dot in the corner. @default false */
  showStatus?: boolean;
  /** Accessible label. Defaults to "<pet> (<status>)". */
  label?: string;
  style?: CSSProperties;
}

export function PetAvatar({
  pet = "cato",
  size = "md",
  status = "idle",
  ring = false,
  showStatus = false,
  label,
  className = "",
  style,
  ...rest
}: PetAvatarProps) {
  const cls = [
    "pd-pet",
    `pd-pet--${size}`,
    `pd-pet--${status}`,
    ring ? "pd-pet--ring" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const css = {
    "--ring-color": PET_RINGS[pet],
    "--status-color": STATUS_COLOR[status],
    ...style,
  } as CSSProperties;

  return (
    <span
      className={cls}
      style={css}
      role="img"
      aria-label={label ?? `${pet} (${status})`}
      {...rest}
    >
      <span className="pd-pet__bg" style={{ background: PET_TINTS[pet] }} />
      {PETS[pet] ?? PETS.cato}
      {showStatus ? <span className="pd-pet__status" /> : null}
    </span>
  );
}
