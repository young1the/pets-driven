import type { HTMLAttributes, ReactNode } from "react";
import "./slides.css";

/**
 * Cover slide: brand mark, eyebrow, hero title and a pack of pets peeking up
 * from the bottom-right. Pet art and the brand mark are supplied as nodes,
 * so the deck stays art-agnostic. Wrap the highlighted part of the title in
 * `<span className="pd-slide__hl">…</span>` (exported as `SlideHighlight`).
 */
export interface TitleSlideProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Brand logo / wordmark node (rendered ~46px tall). */
  brand?: ReactNode;
  /** Small uppercase kicker above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Pet art nodes for the peeking pack. */
  pets?: ReactNode[];
}

/** Inline highlight span for use inside slide titles/quotes. */
export function SlideHighlight({ children }: { children: ReactNode }) {
  return <span className="pd-slide__hl">{children}</span>;
}

export function TitleSlide({
  brand,
  eyebrow,
  title,
  subtitle,
  pets = [],
  className = "",
  ...rest
}: TitleSlideProps) {
  return (
    <div className={`pd-slide pd-slide--title ${className}`.trim()} {...rest}>
      <div className="pd-slide__dots" />
      {brand && <div className="pd-slide__brand">{brand}</div>}
      {eyebrow && <div className="pd-slide__eyebrow">{eyebrow}</div>}
      <h1 className="pd-slide__title">{title}</h1>
      {subtitle && <p className="pd-slide__sub">{subtitle}</p>}
      {pets.length > 0 && (
        <div className="pd-slide-pack">
          {pets.map((pet, i) => (
            <div className="pd-slide-pack__item pd-slide-art" key={i}>
              {pet}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
