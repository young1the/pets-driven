import { useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import "./tabs.css";

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}

/**
 * A soft pill tab bar. Controlled (`value` + `onChange`) or uncontrolled
 * (`defaultValue`).
 */
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items?: TabItem[];
  /** Controlled active value. */
  value?: string;
  /** Initial value when uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Stretch tabs to fill the container. @default false */
  fullWidth?: boolean;
}

export function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  fullWidth = false,
  className = "",
  ...rest
}: TabsProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.value);
  const active = isControlled ? value : internal;

  const select = (next: string) => {
    if (!isControlled) {
      setInternal(next);
    }

    onChange?.(next);
  };

  return (
    <div
      className={["pd-tabs", fullWidth ? "pd-tabs--block" : "", className]
        .filter(Boolean)
        .join(" ")}
      role="tablist"
      {...rest}
    >
      {items.map((item) => (
        <button
          aria-selected={active === item.value}
          className={["pd-tab", active === item.value ? "pd-tab--active" : ""]
            .filter(Boolean)
            .join(" ")}
          key={item.value}
          onClick={() => select(item.value)}
          role="tab"
          type="button"
        >
          {item.icon}
          {item.label}
          {item.badge != null && <span className="pd-tab__badge">{item.badge}</span>}
        </button>
      ))}
    </div>
  );
}
