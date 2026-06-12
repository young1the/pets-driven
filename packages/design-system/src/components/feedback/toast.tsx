import type { HTMLAttributes, ReactNode } from "react";
import "./toast.css";

/**
 * A soft notification card with a message and optional action.
 * Presentational: render a stack of these in a fixed corner container.
 */
export interface ToastProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Accent color role. @default "primary" */
  tone?: "primary" | "success" | "danger" | "warning" | "info";
  title?: ReactNode;
  description?: ReactNode;
  /** Leading avatar/illustration node. */
  pet?: ReactNode;
  actionLabel?: ReactNode;
  onAction?: () => void;
  onClose?: () => void;
}

export function Toast({
  tone = "primary",
  title,
  description,
  pet,
  actionLabel,
  onAction,
  onClose,
  className = "",
  ...rest
}: ToastProps) {
  return (
    <div
      className={["pd-toast", `pd-toast--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
      role="status"
      {...rest}
    >
      {pet}
      <div className="pd-toast__body">
        {title && <div className="pd-toast__title">{title}</div>}
        {description && <div className="pd-toast__desc">{description}</div>}
        {actionLabel && (
          <button className="pd-toast__action" onClick={onAction} type="button">
            {actionLabel}
          </button>
        )}
      </div>
      {onClose && (
        <button
          aria-label="Dismiss"
          className="pd-toast__close"
          onClick={onClose}
          type="button"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.6"
            viewBox="0 0 24 24"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
