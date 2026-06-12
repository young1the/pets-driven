import type { HTMLAttributes, ReactNode } from "react";
import "./card.css";

/**
 * The soft surface container: rounded, hairline border, puffy shadow.
 * Optional `interactive` adds a hover lift; `tone` tints the surface.
 */
export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Surface tint. @default "default" */
  tone?: "default" | "lavender" | "teal" | "mint" | "blossom";
  /** Inner padding. @default "md" */
  padding?: "none" | "sm" | "md" | "lg";
  /** Hover lift + pointer cursor. @default false */
  interactive?: boolean;
  /** Shadow strength. @default "md" */
  elevation?: "none" | "md" | "lg";
  /** Display-font heading rendered at the top. */
  title?: ReactNode;
  /** Muted line under the title. */
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function Card({
  tone = "default",
  padding = "md",
  interactive = false,
  elevation = "md",
  title,
  subtitle,
  className = "",
  children,
  ...rest
}: CardProps) {
  const cls = [
    "pd-card2",
    `pd-card2--pad-${padding}`,
    tone !== "default" ? `pd-card2--${tone}` : "",
    elevation === "lg" ? "pd-card2--raised" : "",
    elevation === "none" ? "pd-card2--flat" : "",
    interactive ? "pd-card2--interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} {...rest}>
      {title && <div className="pd-card2__header">{title}</div>}
      {subtitle && <div className="pd-card2__sub">{subtitle}</div>}
      {children}
    </div>
  );
}
