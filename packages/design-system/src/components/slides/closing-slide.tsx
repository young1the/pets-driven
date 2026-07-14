import type { HTMLAttributes, ReactNode } from "react";
import "./slides.css";

/**
 * Closing / CTA slide on dark ink: the full pack, a title, subtitle, a pill
 * CTA and a footer (brand mark + tagline).
 */
export interface ClosingSlideProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Pet art nodes for the full pack. */
  pets?: ReactNode[];
  title: ReactNode;
  subtitle?: ReactNode;
  cta?: ReactNode;
  /** Footer content, e.g. brand mark + tagline. */
  footer?: ReactNode;
}

export function ClosingSlide({
  pets = [],
  title,
  subtitle,
  cta,
  footer,
  className = "",
  ...rest
}: ClosingSlideProps) {
  return (
    <div className={`pd-slide pd-slide--closing ${className}`.trim()} {...rest}>
      <div className="pd-slide__dots" />
      {pets.length > 0 && (
        <div className="pd-slide-closing-pack">
          {pets.map((pet, i) => (
            <div className="pd-slide-closing-pack__item pd-slide-art" key={i}>
              {pet}
            </div>
          ))}
        </div>
      )}
      <h1 className="pd-slide__title">{title}</h1>
      {subtitle && <p className="pd-slide__sub">{subtitle}</p>}
      {cta && <div className="pd-slide__cta">{cta}</div>}
      {footer && <div className="pd-slide__foot">{footer}</div>}
    </div>
  );
}
