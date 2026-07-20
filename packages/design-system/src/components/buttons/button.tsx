import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ElementType, ReactNode } from "react";
import "./button.css";

/**
 * The tactile, chunky Pets-Driven button with a signature "toy lip" that
 * compresses on press. Use for primary and secondary actions.
 */
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "accent" | "mint" | "neutral" | "ghost";
  /** Control height. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Icon node rendered before the label. */
  iconLeft?: ReactNode;
  /** Icon node rendered after the label. */
  iconRight?: ReactNode;
  /** Show a spinner and disable interaction. @default false */
  loading?: boolean;
  /** Stretch to fill the container width. @default false */
  fullWidth?: boolean;
  /** Render as a different element (e.g. "a"). @default "button" */
  as?: ElementType;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  iconLeft = null,
  iconRight = null,
  loading = false,
  fullWidth = false,
  disabled = false,
  as: Tag = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    "pd-btn",
    `pd-btn--${variant}`,
    `pd-btn--${size}`,
    fullWidth ? "pd-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span aria-hidden="true" className="pd-btn__spin" />}
      {!loading && iconLeft}
      {children && <span>{children}</span>}
      {!loading && iconRight}
    </Tag>
  );
}
