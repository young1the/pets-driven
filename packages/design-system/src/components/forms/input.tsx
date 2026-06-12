import type { InputHTMLAttributes, ReactNode } from "react";
import "./input.css";

/**
 * A soft, gently sunken text field with optional leading icon, label,
 * hint and error states.
 */
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Field label rendered above the input. */
  label?: string;
  /** Helper text below the input (turns red when `error`). */
  hint?: string;
  /** Error state. @default false */
  error?: boolean;
  /** Control height. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Leading icon node. */
  icon?: ReactNode;
  /** Mark the label with a required asterisk. @default false */
  required?: boolean;
}

export function Input({
  label,
  hint,
  error = false,
  size = "md",
  icon = null,
  required = false,
  id,
  className = "",
  ...rest
}: InputProps) {
  const fieldId =
    id || (label ? `pd-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div
      className={["pd-field", error ? "pd-field--error" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {label && (
        <label className="pd-field__label" htmlFor={fieldId}>
          {label}
          {required && <span className="pd-field__req">*</span>}
        </label>
      )}
      <div className="pd-inputwrap">
        {icon && <span className="pd-inputwrap__icon">{icon}</span>}
        <input
          aria-invalid={error || undefined}
          className={[
            "pd-input",
            `pd-input--${size}`,
            icon ? "pd-input--hasicon" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          id={fieldId}
          required={required}
          {...rest}
        />
      </div>
      {hint && <span className="pd-field__hint">{hint}</span>}
    </div>
  );
}
