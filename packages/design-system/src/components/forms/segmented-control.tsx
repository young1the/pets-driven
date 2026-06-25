import type { ReactNode } from "react";
import "./segmented-control.css";

export type SegmentedOption = {
  value: string;
  label: ReactNode;
};

/**
 * A compact segmented toggle: a sunken track holding one raised, selected
 * segment. Controlled via `value` + `onChange`.
 */
export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps) {
  return (
    <div
      className={["pd-segmented", className].filter(Boolean).join(" ")}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            aria-selected={active}
            className={[
              "pd-segmented__item",
              active ? "pd-segmented__item--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
