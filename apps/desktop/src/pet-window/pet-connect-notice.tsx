import { useEffect } from "react";
import "@/pet-window/pet-connect-notice.css";

/** How long a resolved connect notice lingers before it dismisses itself. */
export const PET_CONNECT_NOTICE_TTL_MS = 2600;

export type PetConnectNotice = {
  /**
   * Distinct identity per emission. The auto-dismiss timer keys on this, so a
   * fresh notice always restarts the countdown — and, crucially, unrelated
   * re-renders never restart or orphan it.
   */
  id: number;
  /** The line to show. */
  text: string;
  /**
   * `false` for the "pick a window" prompt, which persists until the pick
   * resolves; `true` for the connected/cancelled result, which fades on the TTL.
   */
  transient: boolean;
};

type PetConnectNoticeViewProps = {
  notice: PetConnectNotice | null;
  /** Cleared by the notice's own timer when a transient notice lapses. */
  onDismiss: () => void;
  /** Matches the status card's shrink at small pet sizes. */
  scale: number;
};

/**
 * The pet window's terminal-binding feedback: a small floating pill above the
 * pet, separate from the ECS-driven status card. It owns its own dismissal —
 * a transient (connected/cancelled) notice schedules a single timeout keyed on
 * the notice identity, so no binding event or parent re-render can cancel it.
 */
export function PetConnectNoticeView({ notice, onDismiss, scale }: PetConnectNoticeViewProps) {
  useEffect(() => {
    if (!notice?.transient) {
      return;
    }

    const timer = window.setTimeout(onDismiss, PET_CONNECT_NOTICE_TTL_MS);

    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) {
    return null;
  }

  const pillScale = Math.max(0.85, Math.min(1, scale));

  return (
    <div
      className="pet-connect-notice"
      data-state={notice.transient ? "resolved" : "connecting"}
      role="status"
      style={{ "--pet-connect-notice-scale": pillScale } as React.CSSProperties}
    >
      <span aria-hidden="true" className="pet-connect-notice__icon">
        <svg
          aria-hidden="true"
          fill="none"
          height="12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="12"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" x2="20" y1="19" y2="19" />
        </svg>
      </span>
      <span className="pet-connect-notice__text">{notice.text}</span>
    </div>
  );
}
