import type { HTMLAttributes, ReactNode } from "react";
import "./badge.css";

export type BadgeTone =
  | "primary"
  | "accent"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral";

/**
 * A small status pill. Use `tone` for color and `variant` for solid/soft.
 * Optional `dot` shows a leading status dot.
 */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color role. @default "primary" */
  tone?: BadgeTone;
  /** Fill style. @default "soft" */
  variant?: "soft" | "solid";
  /** Show a leading status dot. @default false */
  dot?: boolean;
  /** Leading icon node. */
  icon?: ReactNode;
  children?: ReactNode;
}

export function Badge({
  tone = "primary",
  variant = "soft",
  dot = false,
  icon = null,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  const cls = ["pd-badge", `pd-badge--${variant}`, `pd-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} {...rest}>
      {dot && <span className="pd-badge__dot" />}
      {icon}
      {children}
    </span>
  );
}
