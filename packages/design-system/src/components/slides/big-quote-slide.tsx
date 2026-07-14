import type { HTMLAttributes, ReactNode } from "react";
import "./slides.css";

/**
 * Oversized pull-quote on blossom, with an attribution row and a faint
 * oversized pet watermark behind it. The quotation marks are added for you.
 */
export interface BigQuoteSlideProps extends HTMLAttributes<HTMLDivElement> {
  quote: ReactNode;
  /** Attribution pet art (small avatar). */
  pet?: ReactNode;
  authorName?: ReactNode;
  authorMeta?: ReactNode;
  /** Large faded pet art in the corner. Defaults to `pet`. */
  watermark?: ReactNode;
}

export function BigQuoteSlide({
  quote,
  pet,
  authorName,
  authorMeta,
  watermark,
  className = "",
  ...rest
}: BigQuoteSlideProps) {
  const bigpet = watermark ?? pet;
  return (
    <div className={`pd-slide pd-slide--quote ${className}`.trim()} {...rest}>
      {bigpet && <div className="pd-slide__bigpet pd-slide-art">{bigpet}</div>}
      <div className="pd-slide__quote">
        <span className="pd-slide__quote-mark">“</span>
        {quote}
        <span className="pd-slide__quote-mark">”</span>
      </div>
      {(pet || authorName || authorMeta) && (
        <div className="pd-slide-by">
          {pet && <div className="pd-slide-by__art pd-slide-art">{pet}</div>}
          <div>
            {authorName && <b className="pd-slide-by__name">{authorName}</b>}
            {authorMeta && <span className="pd-slide-by__meta">{authorMeta}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
