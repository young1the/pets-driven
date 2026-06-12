import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import "./tag.css";

/**
 * A chip for filters/labels. Optional `onRemove` shows a remove ×.
 */
export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Leading dot color (any CSS color). */
  color?: string;
  /** Selected (filled) state. @default false */
  selected?: boolean;
  /** Show a remove × and call this when clicked. */
  onRemove?: (event: MouseEvent<HTMLSpanElement>) => void;
  children?: ReactNode;
}

export function Tag({
  color,
  selected = false,
  onRemove,
  onClick,
  className = "",
  children,
  ...rest
}: TagProps) {
  const clickable = Boolean(onClick);
  const cls = [
    "pd-tag",
    clickable ? "pd-tag--clickable" : "",
    selected ? "pd-tag--selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} onClick={onClick} {...rest}>
      {color && <span className="pd-tag__dot" style={{ background: color }} />}
      {children}
      {onRemove && (
        <span
          aria-label="Remove"
          className="pd-tag__x"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(event);
          }}
          role="button"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
      )}
    </span>
  );
}
