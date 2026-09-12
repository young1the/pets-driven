import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
  const stripRef = useRef<HTMLDivElement>(null);
  // Which ends have tabs still hidden past them: "", "start", "end", or both.
  // The CSS reads it to fade that end, which is the only thing telling a phone
  // there is more strip to drag to.
  const [scrollable, setScrollable] = useState("");

  // Measured rather than derived from the item count: whether the strip
  // overflows depends on label lengths, the font that actually loaded, and the
  // width it was given — none of which this component knows.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      // Sub-pixel layout leaves a fraction of slack on a strip that fits, so a
      // bare `> 0` fades both ends of a strip with nothing to scroll to.
      const ends = [];
      if (strip.scrollLeft > 1) ends.push("start");
      if (strip.scrollLeft < max - 1) ends.push("end");
      setScrollable(ends.join(" "));
    };

    measure();
    strip.addEventListener("scroll", measure, { passive: true });

    // Catches the container being resized and the tabs themselves reflowing
    // (a late webfont, a translated label), which a scroll event never fires
    // for. Guarded because jsdom ships no ResizeObserver: a shared component
    // must not make every consumer's test suite polyfill one, and a strip that
    // never re-measures is only missing an affordance.
    if (typeof ResizeObserver === "undefined") {
      return () => strip.removeEventListener("scroll", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    for (const child of strip.children) observer.observe(child);

    return () => {
      strip.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  // A tab selected while it sits half past the fade — reachable by keyboard, or
  // by tapping the sliver — pulls itself into view rather than staying clipped.
  // The selected tab is found by scanning `data-value` rather than by selector,
  // so the lookup genuinely depends on `active` and no value needs escaping.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || active == null) return;

    for (const child of strip.children) {
      if (child.getAttribute("data-value") !== active) continue;
      // jsdom implements no scrollIntoView, and this is presentation only.
      // `block: "nearest"` so it never scrolls the page vertically to a strip
      // that happens to be off-screen.
      child.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      return;
    }
  }, [active]);

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
      data-scrollable={scrollable || undefined}
      ref={stripRef}
      role="tablist"
      {...rest}
    >
      <span aria-hidden="true" className="pd-tabs__edge pd-tabs__edge--start" role="presentation" />
      {items.map((item) => (
        <button
          aria-selected={active === item.value}
          className={["pd-tab", active === item.value ? "pd-tab--active" : ""]
            .filter(Boolean)
            .join(" ")}
          data-value={item.value}
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
      <span aria-hidden="true" className="pd-tabs__edge pd-tabs__edge--end" role="presentation" />
    </div>
  );
}
