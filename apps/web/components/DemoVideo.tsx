"use client";

import { type CSSProperties, useEffect, useRef } from "react";

/**
 * A silent, looping demo clip that costs nothing until it is scrolled near.
 *
 * The obvious markup — `<video autoPlay>` — is what this exists to avoid:
 * `autoplay` starts the resource fetch at page load and overrides `preload`, so
 * a clip four screens down competes with the hero for bandwidth. Here the
 * element ships with `preload="none"` and no `autoplay`, and an
 * IntersectionObserver calls `play()` (which begins the fetch) once the clip is
 * within a screen of the viewport — the same deferral `loading="lazy"` gives an
 * `<img>`, which is what these clips used to be.
 *
 * `controls` is deliberate on the long product demo and off on the short
 * looping cards, which read as animated illustrations rather than as video.
 */
export function DemoVideo({
  src,
  poster,
  label,
  controls = false,
  width,
  height,
  style,
}: {
  src: string;
  poster?: string;
  /** Accessible name — these clips carry meaning, so it is required. */
  label: string;
  controls?: boolean;
  width?: number;
  height?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        // Muted playback is always permitted, but a browser may still refuse
        // (Low Power Mode, a data-saver setting). `controls` and the poster
        // keep the element usable either way, so swallow the rejection.
        el.play().catch(() => {});
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      aria-label={label}
      controls={controls}
      height={height}
      loop
      muted
      playsInline
      poster={poster}
      preload="none"
      style={style}
      width={width}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
