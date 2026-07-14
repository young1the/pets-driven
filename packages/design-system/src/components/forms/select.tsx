import type { ReactNode, SelectHTMLAttributes } from "react";
import "./select.css";

export type SelectOption = string | { value: string; label: string };

/**
 * A styled native <select> with a soft chevron and label support.
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Field label rendered above the select. */
  label?: string;
  /** Control height. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Options as strings or {value, label} pairs. Ignored when children given. */
  options?: SelectOption[];
  children?: ReactNode;
}

function Chevron() {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Select({
  label,
  size = "md",
  options = [],
  id,
  className = "",
  children,
  ...rest
}: SelectProps) {
  const fieldId = id || (label ? `pd-sel-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div className={["pd-select-field", className].filter(Boolean).join(" ")}>
      {label && (
        <label className="pd-select-field__label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <div className="pd-select-wrap">
        <select className={["pd-select", `pd-select--${size}`].join(" ")} id={fieldId} {...rest}>
          {children ||
            options.map((option) => {
              const value = typeof option === "string" ? option : option.value;
              const text = typeof option === "string" ? option : option.label;

              return (
                <option key={value} value={value}>
                  {text}
                </option>
              );
            })}
        </select>
        <span className="pd-select-wrap__chev">
          <Chevron />
        </span>
      </div>
    </div>
  );
}
