import type { InputHTMLAttributes, ReactNode } from "react";
import "./checkbox.css";

/**
 * A soft rounded checkbox with a springy check-in animation.
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Label text rendered next to the box. */
  label?: string;
  children?: ReactNode;
}

export function Checkbox({
  label,
  disabled = false,
  className = "",
  children,
  ...rest
}: CheckboxProps) {
  return (
    <label
      className={[
        "pd-check",
        disabled ? "pd-check--disabled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input disabled={disabled} type="checkbox" {...rest} />
      <span className="pd-check__box">
        <svg
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
          viewBox="0 0 24 24"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {(label || children) && <span>{label || children}</span>}
    </label>
  );
}
