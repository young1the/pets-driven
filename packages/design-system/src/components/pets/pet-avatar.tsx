import type { CSSProperties, HTMLAttributes } from "react";
import { PETS, type PetName } from "./pets";
import "./pet-avatar.css";

/**
 * PetAvatar — the brand's signature component. Renders one of the six pets in a
 * soft circular badge with an optional status ring and mood animation.
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
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const css = {
    "--status-color": STATUS_COLOR[status],
    ...style,
  } as CSSProperties;
  const petImage = PETS[pet] ?? PETS.cato;
  const petImageSrc =
    typeof petImage === "string" ? petImage : petImage.src;

  return (
    <span
      className={cls}
      style={css}
      role="img"
      aria-label={label ?? `${pet} (${status})`}
      {...rest}
    >
      <img
        className="pd-pet__art"
        src={petImageSrc}
        alt=""
        aria-hidden="true"
      />
      {showStatus ? <span className="pd-pet__status" /> : null}
    </span>
  );
}
