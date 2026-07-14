import type { InputHTMLAttributes, ReactNode } from "react";
import "./switch.css";

/**
 * A squishy pill toggle. Controlled via `checked` + `onChange`, or
 * uncontrolled with `defaultChecked`.
 */
export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Label text rendered next to the track. */
  label?: string;
  /** Size. @default "md" */
  size?: "sm" | "md";
  children?: ReactNode;
}

export function Switch({
  label,
  size = "md",
  disabled = false,
  className = "",
  children,
  ...rest
}: SwitchProps) {
  return (
    <label
      className={[
        "pd-switch",
        `pd-switch--${size}`,
        disabled ? "pd-switch--disabled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* biome-ignore lint/a11y/useAriaPropsForRole: native checkbox input derives aria-checked from its `checked` state; role="switch" only refines how assistive tech announces it. */}
      <input disabled={disabled} role="switch" type="checkbox" {...rest} />
      <span className="pd-switch__track">
        <span className="pd-switch__thumb" />
      </span>
      {(label || children) && <span>{label || children}</span>}
    </label>
  );
}
