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
  onRemove?: (event: MouseEvent<HTMLButtonElement>) => void;
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
    // biome-ignore lint/a11y/noStaticElementInteractions: role, tabIndex, and the keyboard handler are all applied together whenever the tag is clickable (clickable === Boolean(onClick)); the analyzer can't correlate those conditionals.
    <span
      className={cls}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                // Route keyboard activation through the native click path so
                // consumers only need to wire up `onClick`.
                event.currentTarget.click();
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      {...rest}
    >
      {color && <span className="pd-tag__dot" style={{ background: color }} />}
      {children}
      {onRemove && (
        <button
          aria-label="Remove"
          className="pd-tag__x"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(event);
          }}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
