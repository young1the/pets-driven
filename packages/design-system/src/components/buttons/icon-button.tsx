import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./icon-button.css";

/**
 * A circular, icon-only button. Always pass a `label` for accessibility.
 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "ghost" */
  variant?: "ghost" | "soft" | "solid";
  /** Size. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Accessible label (also used as tooltip title). Required. */
  label: string;
  /** The icon node (e.g. a Lucide <svg>). */
  children?: ReactNode;
}

export function IconButton({
  variant = "ghost",
  size = "md",
  label,
  className = "",
  children,
  ...rest
}: IconButtonProps) {
  const cls = ["pd-iconbtn", `pd-iconbtn--${variant}`, `pd-iconbtn--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button aria-label={label} className={cls} title={label} type="button" {...rest}>
      {children}
    </button>
  );
}
