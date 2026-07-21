"use client";

import { useEffect, useRef } from "react";

/**
 * Client boundary for the homepage's cinematic scroll behavior.
 *
 * It owns only the interaction: it renders the scene root and, via a ref, wires
 * up scroll-pinned stages (driving the `--p` custom property) and reveal-on-
 * enter. All the actual scene markup is passed in as `children` and stays a
 * Server Component, so none of it ships as client JS — the logic here works
 * purely off `data-pin` / `data-reveal` DOM attributes.
 */
export function IntroScenes({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ---- Scroll-pinned scenes: drive --p on each stage ----
    const pins = Array.from(root.querySelectorAll<HTMLElement>("[data-pin]"));
    pins.forEach((sec) => {
      const len = parseFloat(sec.getAttribute("data-len") || "300") || 300;
      sec.style.height = `${len}vh`;
    });

    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      for (const sc of pins) {
        const r = sc.getBoundingClientRect();
        const len = sc.offsetHeight - vh;
        let pr = len > 0 ? -r.top / len : r.top < 0 ? 1 : 0;
        pr = Math.max(0, Math.min(1, pr));
        const stage = sc.querySelector<HTMLElement>(".stage") || (sc as HTMLElement);
        stage.style.setProperty("--p", pr.toFixed(4));
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // ---- Reveal-on-enter ----
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.style.opacity = "1";
          el.style.transform = "none";
          io.unobserve(el);
        });
      },
      { threshold: 0.18 },
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      io.observe(el);
    });

    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <div
      className="pdd-root"
      id="pddRoot"
      ref={rootRef}
      style={{
        fontFamily: "var(--font-body)",
        color: "var(--ink-800)",
        background: "#FFFCFD",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {children}
    </div>
  );
}
