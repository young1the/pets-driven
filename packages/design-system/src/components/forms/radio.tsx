import type { InputHTMLAttributes, ReactNode } from "react";
import "./radio.css";

/**
 * A soft circular radio button. Use inside a shared `name` group.
 */
export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Label text rendered next to the dot. */
  label?: string;
  children?: ReactNode;
}

export function Radio({
  label,
  disabled = false,
  className = "",
  children,
  ...rest
}: RadioProps) {
  return (
    <label
      className={[
        "pd-radio",
        disabled ? "pd-radio--disabled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input disabled={disabled} type="radio" {...rest} />
      <span className="pd-radio__dot" />
      {(label || children) && <span>{label || children}</span>}
    </label>
  );
}
