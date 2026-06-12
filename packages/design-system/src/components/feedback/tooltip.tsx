import type { HTMLAttributes, ReactNode } from "react";
import "./tooltip.css";

/**
 * A small soft tooltip on hover/focus. Wraps a single child.
 */
export interface TooltipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "content"> {
  content: ReactNode;
  /** Placement. @default "top" */
  side?: "top" | "bottom";
  children?: ReactNode;
}

export function Tooltip({
  content,
  side = "top",
  className = "",
  children,
  ...rest
}: TooltipProps) {
  return (
    <span className={["pd-tip", className].filter(Boolean).join(" ")} {...rest}>
      {children}
      <span className={`pd-tip__pop pd-tip__pop--${side}`} role="tooltip">
        {content}
      </span>
    </span>
  );
}
