import type { HTMLAttributes, ReactNode } from "react";
import "./slides.css";

/**
 * Section divider: teal field, a kicker number, big title and one bobbing pet
 * on the right.
 */
export interface SectionSlideProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Kicker, e.g. "01 — Meet the pack". */
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Single pet art node. */
  pet?: ReactNode;
}

export function SectionSlide({
  kicker,
  title,
  subtitle,
  pet,
  className = "",
  ...rest
}: SectionSlideProps) {
  return (
    <div className={`pd-slide pd-slide--section ${className}`.trim()} {...rest}>
      <div className="pd-slide__dots" />
      {kicker && <div className="pd-slide__num">{kicker}</div>}
      <h1 className="pd-slide__title">{title}</h1>
      {subtitle && <p className="pd-slide__sub">{subtitle}</p>}
      {pet && (
        <div className="pd-slide__pet">
          <div className="pd-slide-art">{pet}</div>
        </div>
      )}
    </div>
  );
}
