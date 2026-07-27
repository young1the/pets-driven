import { type ReactNode, useEffect } from "react";
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
  /**
   * Whether Escape and a click on the scrim close the dialog. Turn it off when
   * the content owns the keyboard or holds work that a stray click must not
   * destroy — a live terminal is both, since Escape there belongs to the shell.
   * The close button and footer stay, so there is always a deliberate way out.
   */
  dismissible?: boolean;
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
  dismissible = true,
  className = "",
  children,
}: DialogProps) {
  useEffect(() => {
    if (!open || !dismissible) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, dismissible]);

  if (!open) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismissal is a pointer-only enhancement; keyboard users close via Escape or the close button.
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismissal is a pointer-only enhancement; keyboard users close via Escape or the close button.
    <div
      className="pd-dialog__scrim"
      onClick={(event) => {
        // Close only when the scrim itself is clicked, not the panel inside it.
        if (dismissible && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        aria-modal="true"
        className={["pd-dialog", pet ? "pd-dialog--haspet" : "", className]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
      >
        {pet && <span className="pd-dialog__pet">{pet}</span>}
        {showClose && (
          <button aria-label="Close" className="pd-dialog__close" onClick={onClose} type="button">
            <svg
              aria-hidden="true"
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
