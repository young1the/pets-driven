"use client";

import {
  Card,
  CheckIcon,
  PaletteIcon,
  PawIcon,
  PlugIcon,
  SparkleIcon,
  Tabs,
  TerminalIcon,
} from "@pets-driven/design-system";
import { type ReactNode, useState } from "react";
import { DemoVideo } from "@/components/DemoVideo";
import type { FeaturePointKey } from "@/lib/feature-points";

/** One explainer point, already translated by the server component above it. */
export type FeaturePoint = {
  key: FeaturePointKey;
  clip: string;
  /** Short tab-strip label; the panel carries the full `title`. */
  tab: string;
  title: string;
  body: string;
  alt: string;
};

const TAB_ICONS: Record<FeaturePointKey, ReactNode> = {
  agents: <PlugIcon />,
  status: <CheckIcon />,
  cli: <TerminalIcon />,
  petdex: <PaletteIcon />,
  skills: <SparkleIcon />,
  alive: <PawIcon />,
};

/**
 * The feature section's points, one panel at a time.
 *
 * Two rules shape the markup, and they pull in opposite directions:
 *
 *   - **Every panel's prose ships in the served HTML.** The inactive panels are
 *     hidden with the `hidden` attribute rather than left unrendered, so a
 *     crawler reads every title and body from the document as served. Text
 *     hidden behind a tab is indexed; text that was never rendered is not.
 *   - **Only the active panel's clip is mounted.** Rendering one `<video>` per
 *     point and hiding all but one would walk straight back into the eager
 *     media load this page was trimmed for. The prose is a few hundred bytes and the
 *     clips are megabytes, so they get opposite treatment. A tab the visitor
 *     comes back to remounts its clip and refetches from the HTTP cache, which
 *     is the cheaper side of that trade.
 *
 * Every point needs an entry in `TAB_ICONS`, and the strip has to stay inside
 * the 1080px container on a desktop window — an icon costs about 23px, so a
 * point added past these six is worth re-measuring rather than assuming.
 *
 * `Tabs` renders the tablist and owns no panels, so the `role="tabpanel"`
 * wrappers and their accessible names are set here. It also emits no
 * `aria-controls`, so the pairing is by DOM order and by each panel's label
 * matching its tab.
 */
export function FeatureTabs({ points }: { points: FeaturePoint[] }) {
  const [active, setActive] = useState<string>(points[0]?.key ?? "");

  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Tabs
          items={points.map((point) => ({
            value: point.key,
            label: point.tab,
            icon: TAB_ICONS[point.key],
          }))}
          onChange={setActive}
          value={active}
        />
      </div>

      {points.map((point) => {
        const isActive = point.key === active;

        return (
          <div
            aria-label={point.tab}
            hidden={!isActive}
            key={point.key}
            role="tabpanel"
            style={{ marginTop: 28 }}
          >
            <Card padding="none">
              {isActive && (
                <DemoVideo
                  height={360}
                  label={point.alt}
                  poster={`/demo/${point.clip}.webp`}
                  src={`/demo/${point.clip}.mp4`}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    aspectRatio: "16 / 9",
                    borderBottom: "1px solid var(--border-soft)",
                  }}
                  width={640}
                />
              )}
              <div style={{ padding: "20px 22px 22px" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: 18,
                    lineHeight: 1.3,
                    color: "var(--ink-950)",
                    margin: 0,
                  }}
                >
                  {point.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: "var(--ink-700)",
                    margin: "10px 0 0",
                  }}
                >
                  {point.body}
                </p>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
