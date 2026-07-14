import type { HTMLAttributes, ReactNode } from "react";
import "./slides.css";

/**
 * Two-column comparison: a muted "old way" column of crosses against a
 * highlighted "Pets-Driven way" column of checks, headed by a pet.
 */
export interface ComparisonSlideProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  /** Tag label for the left column. @default "The old way" */
  oldLabel?: ReactNode;
  oldItems: ReactNode[];
  /** Pet art heading the right column. */
  newPet?: ReactNode;
  /** Heading text next to `newPet`. @default "The Pets-Driven way" */
  newLabel?: ReactNode;
  newItems: ReactNode[];
}

export function ComparisonSlide({
  title,
  oldLabel = "The old way",
  oldItems,
  newPet,
  newLabel = "The Pets-Driven way",
  newItems,
  className = "",
  ...rest
}: ComparisonSlideProps) {
  return (
    <div className={`pd-slide pd-slide--comparison ${className}`.trim()} {...rest}>
      <h1 className="pd-slide__title">{title}</h1>
      <div className="pd-slide-cols">
        <div className="pd-slide-col pd-slide-col--old">
          <span className="pd-slide-col__tag">{oldLabel}</span>
          {oldItems.map((item, i) => (
            <div className="pd-slide-row" key={i}>
              <span className="pd-slide-row__ic pd-slide-row__ic--x">✕</span>
              {item}
            </div>
          ))}
        </div>
        <div className="pd-slide-col pd-slide-col--new">
          <div className="pd-slide-col__pethead">
            {newPet && <div className="pd-slide-art">{newPet}</div>}
            <b>{newLabel}</b>
          </div>
          {newItems.map((item, i) => (
            <div className="pd-slide-row" key={i}>
              <span className="pd-slide-row__ic pd-slide-row__ic--c">✓</span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
