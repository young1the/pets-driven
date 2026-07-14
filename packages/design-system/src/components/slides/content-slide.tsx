import type { HTMLAttributes, ReactNode } from "react";
import "./slides.css";

export interface ContentSlidePoint {
  /** Pet art node shown as the bullet. */
  art: ReactNode;
  title: ReactNode;
  description: ReactNode;
}

/**
 * Body slide: eyebrow + title with pet-bulleted points on the left, and a
 * featured pet card aside on the right.
 */
export interface ContentSlideProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: ReactNode;
  title: ReactNode;
  points: ContentSlidePoint[];
  /** Featured pet art for the aside card. */
  asideArt?: ReactNode;
  asideCaption?: ReactNode;
  asideRole?: ReactNode;
}

export function ContentSlide({
  eyebrow,
  title,
  points,
  asideArt,
  asideCaption,
  asideRole,
  className = "",
  ...rest
}: ContentSlideProps) {
  return (
    <div className={`pd-slide pd-slide--content ${className}`.trim()} {...rest}>
      <div>
        {eyebrow && <div className="pd-slide__eyebrow">{eyebrow}</div>}
        <h1 className="pd-slide__title">{title}</h1>
        {points.map((pt, i) => (
          <div className="pd-slide-point" key={i}>
            <div className="pd-slide-point__art pd-slide-art">{pt.art}</div>
            <div>
              <b className="pd-slide-point__title">{pt.title}</b>
              <span className="pd-slide-point__desc">{pt.description}</span>
            </div>
          </div>
        ))}
      </div>
      {(asideArt || asideCaption || asideRole) && (
        <div className="pd-slide-aside">
          {asideArt && <div className="pd-slide-aside__art pd-slide-art">{asideArt}</div>}
          {asideCaption && <div className="pd-slide-aside__caption">{asideCaption}</div>}
          {asideRole && <div className="pd-slide-aside__role">{asideRole}</div>}
        </div>
      )}
    </div>
  );
}
