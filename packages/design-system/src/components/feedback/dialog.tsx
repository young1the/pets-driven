import type { ReactNode } from "react";
import "./dialog.css";

/**
 * A centered modal with a soft plum scrim and a springy pop-in panel.
 * Controlled via `open` + `onClose`. Optional `pet` shows a peeking avatar.
 */
export interface DialogProps {
  open?: boolean;
  onClose?: () => void;
  title?: ReactNode;
  /** Avatar node peeking over the top edge of the panel. */
  pet?: ReactNode;
  footer?: ReactNode;
  showClose?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Dialog({
  open = false,
  onClose,
  title,
  pet,
  footer,
  showClose = true,
  className = "",
  children,
}: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="pd-dialog__scrim" onClick={onClose}>
      <div
        aria-modal="true"
        className={["pd-dialog", pet ? "pd-dialog--haspet" : "", className]
          .filter(Boolean)
          .join(" ")}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {pet && <span className="pd-dialog__pet">{pet}</span>}
        {showClose && (
          <button
            aria-label="Close"
            className="pd-dialog__close"
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
        {title && <h2 className="pd-dialog__title">{title}</h2>}
        <div className="pd-dialog__body">{children}</div>
        {footer && <div className="pd-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
