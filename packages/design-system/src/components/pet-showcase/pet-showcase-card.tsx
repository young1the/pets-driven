import type { ReactNode } from "react";
import "./pet-showcase-card.css";

export interface PetShowcaseCardStatus {
  label: string;
  dotColor: string;
}

/**
 * A pet "trading card": a soft gradient body with note and name at the top, a
 * portrait slot, and small personality/status overlays. Art-agnostic — the
 * portrait is passed in. The caller owns fan positioning; the card only
 * renders the featured ring.
 */
export interface PetShowcaseCardProps {
  note: string;
  role: string;
  name: string;
  status: PetShowcaseCardStatus;
  /** Gradient stops for the card body. */
  gradient: { from: string; to: string };
  portrait: ReactNode;
  featured?: boolean;
  onEdit?: () => void;
  /** Working directory shown as a pill in the top-right corner. */
  cwd?: string;
  className?: string;
}

export function PetShowcaseCard({
  note,
  role,
  name,
  status,
  gradient,
  portrait,
  featured = false,
  onEdit,
  cwd,
  className = "",
}: PetShowcaseCardProps) {
  return (
    <div
      className={[
        "pd-pet-card",
        featured ? "pd-pet-card--featured" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: `linear-gradient(160deg, ${gradient.from}, ${gradient.to})`,
      }}
    >
      <span aria-hidden="true" className="pd-pet-card__wave" />
      <span aria-hidden="true" className="pd-pet-card__scrim" />

      {cwd ? (
        <div
          className="pd-pet-card__cwd"
          aria-label={`Working directory: ${cwd}`}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            width="12"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          {cwd}
        </div>
      ) : null}

      {onEdit ? (
        <button
          aria-label="Edit pet"
          className="pd-pet-card__edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      ) : null}

      <div className="pd-pet-card__head">
        <div className="pd-pet-card__note">{note}</div>
        <div className="pd-pet-card__name">{name}</div>
      </div>

      <div className="pd-pet-card__portrait">
        {portrait}
        <div className="pd-pet-card__footer">
          <div className="pd-pet-card__role-chip">{role}</div>
          <div className="pd-pet-card__status">
            <span
              className="pd-pet-card__status-dot"
              style={{ background: status.dotColor }}
            />
            <span className="pd-pet-card__status-label">{status.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
