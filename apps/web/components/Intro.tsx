"use client";

import { useEffect, useRef } from "react";
import {
  Button,
  PetAvatar,
  type PetAvatarStatus,
  type PetName,
} from "@pets-driven/design-system";
import { DecisionShowcaseApp } from "./DecisionShowcase";

/**
 * Pets-Driven Intro — the official homepage.
 * A faithful React port of the "Pets-Driven Intro" scroll-driven design:
 *   ACT I   The Watch — demon eyes in the dark resolve into the pack as light rises
 *   ACT II  Personalities — the desk scene
 *   ACT V   Simulation slot — placeholder for a future interactive component
 *   ACT IV  Plugins — hatch your pet from the terminal
 *   ACT VI  CTA — send the pack
 *
 * The scroll/reveal/hatch logic mirrors the original design controller; CSS
 * custom properties drive the cinematic transitions. Pets and buttons come from
 * the @pets-driven/design-system package.
 */

const cssVars = (vars: Record<string, string | number>): React.CSSProperties =>
  vars as React.CSSProperties;

type Creature = {
  pet: PetName;
  status: PetAvatarStatus;
  left: string;
  top: string;
  i: number;
  color: string;
  rot: number; // degrees applied as the eye flies away
  eyeW: number;
  eyeH: number;
  blink: string;
  delay: string;
};

const CREATURES: Creature[] = [
  { pet: "cato", status: "working", left: "15%", top: "33%", i: 0, color: "#A189EE", rot: 36, eyeW: 140, eyeH: 65, blink: "4.4s", delay: ".1s" },
  { pet: "pip", status: "thinking", left: "84%", top: "26%", i: 1, color: "#5FB2EA", rot: -30, eyeW: 116, eyeH: 54, blink: "5.1s", delay: ".7s" },
  { pet: "mochi", status: "happy", left: "62%", top: "15%", i: 2, color: "#FF7FB4", rot: 28, eyeW: 124, eyeH: 58, blink: "3.8s", delay: "1.3s" },
  { pet: "fenn", status: "happy", left: "78%", top: "64%", i: 3, color: "#FF7967", rot: -38, eyeW: 132, eyeH: 62, blink: "4.7s", delay: ".4s" },
  { pet: "otto", status: "working", left: "24%", top: "71%", i: 4, color: "#FBC24A", rot: 34, eyeW: 138, eyeH: 64, blink: "4.1s", delay: "1s" },
  { pet: "bloop", status: "thinking", left: "88%", top: "52%", i: 5, color: "#4FC894", rot: -26, eyeW: 128, eyeH: 60, blink: "5.4s", delay: ".2s" },
];

const CTA_PETS: { pet: PetName; status: PetAvatarStatus; delay: string }[] = [
  { pet: "cato", status: "happy", delay: "0s" },
  { pet: "otto", status: "working", delay: ".2s" },
  { pet: "mochi", status: "happy", delay: ".4s" },
  { pet: "fenn", status: "happy", delay: ".6s" },
  { pet: "bloop", status: "thinking", delay: ".8s" },
  { pet: "pip", status: "thinking", delay: "1s" },
];

function EyePair({ c }: { c: Creature }) {
  return (
    <svg
      viewBox="0 0 150 70"
      width={c.eyeW}
      height={c.eyeH}
      style={{
        overflow: "visible",
        filter: "drop-shadow(0 0 15px currentColor) drop-shadow(0 0 5px currentColor)",
        animation: `pdBlink ${c.blink} ease-in-out infinite`,
        animationDelay: c.delay,
      }}
    >
      <g transform="translate(42 36) rotate(15)">
        <ellipse rx="21" ry="12.5" fill="currentColor" />
        <ellipse rx="3.6" ry="10.6" fill="#100d18" />
        <circle cx="-7" cy="-4" r="2.5" fill="#fff" opacity="0.9" />
      </g>
      <g transform="translate(108 36) rotate(-15)">
        <ellipse rx="21" ry="12.5" fill="currentColor" />
        <ellipse rx="3.6" ry="10.6" fill="#100d18" />
        <circle cx="-7" cy="-4" r="2.5" fill="#fff" opacity="0.9" />
      </g>
    </svg>
  );
}

export default function Intro() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ---- Scroll-pinned scenes: drive --p on each stage ----
    const pins = Array.from(root.querySelectorAll<HTMLElement>("[data-pin]"));
    pins.forEach((sec) => {
      const len = parseFloat(sec.getAttribute("data-len") || "300") || 300;
      sec.style.height = len + "vh";
    });

    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      for (const sc of pins) {
        const r = sc.getBoundingClientRect();
        const len = sc.offsetHeight - vh;
        let pr = len > 0 ? -r.top / len : r.top < 0 ? 1 : 0;
        pr = Math.max(0, Math.min(1, pr));
        const stage =
          sc.querySelector<HTMLElement>(".stage") || (sc as HTMLElement);
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
    root
      .querySelectorAll<HTMLElement>("[data-reveal]")
      .forEach((el) => io.observe(el));

    // ---- Hatch interaction ----
    const selected = ["curious", "tidy"];
    const phrase = () => {
      const s = selected.slice();
      if (s.length === 0) return null;
      return s.length === 1
        ? s[0]
        : s.slice(0, -1).join(", ") + " and " + s[s.length - 1];
    };

    let hatchTimers: ReturnType<typeof setTimeout>[] = [];
    const hatch = () => {
      const out = root.querySelector<HTMLElement>("[data-hatch-out]");
      const egg = root.querySelector<HTMLElement>("[data-egg]");
      const hatched = root.querySelector<HTMLElement>("[data-hatched]");
      if (!out || !egg || !hatched) return;
      hatchTimers.forEach((t) => clearTimeout(t));
      hatchTimers = [];
      out.innerHTML = "";
      hatched.style.opacity = "0";
      hatched.style.transform = "scale(.4)";
      egg.style.opacity = "1";
      egg.style.animation = "";
      const ph = phrase();
      const rows: {
        p?: string;
        c?: string;
        t: string;
        m?: number;
        crack?: number;
        done?: number;
      }[] = [];
      rows.push({ p: "$", c: "var(--term-prompt)", t: "/pet-driven:hatch" });
      rows.push({ t: "reading personality plugins…", m: 1 });
      if (selected.length === 0)
        rows.push({ t: "no plugins — hatching a blank slate", m: 1 });
      else
        selected.forEach((tr) =>
          rows.push({ p: "+", c: "var(--term-accent)", t: tr }),
        );
      rows.push({ t: "warming the egg…", m: 1 });
      rows.push({ t: "egg cracking…", m: 1, crack: 1 });
      rows.push({
        p: "✓",
        c: "var(--mint-300)",
        t: "meet Cato" + (ph ? " — " + ph : ""),
        done: 1,
      });
      rows.forEach((r, i) => {
        hatchTimers.push(
          setTimeout(() => {
            const line = document.createElement("div");
            line.style.opacity = "0";
            line.style.transform = "translateY(6px)";
            line.style.transition = "opacity .3s ease, transform .3s ease";
            const pre = r.p
              ? '<span style="color:' + r.c + ';">' + r.p + "</span> "
              : "";
            line.innerHTML =
              pre +
              '<span style="color:' +
              (r.m ? "var(--term-muted)" : "var(--term-fg)") +
              ';">' +
              r.t +
              "</span>";
            out.appendChild(line);
            void line.offsetWidth;
            line.style.opacity = "1";
            line.style.transform = "none";
            if (r.crack) egg.style.animation = "pdShake .5s ease-in-out 2";
            if (r.done)
              hatchTimers.push(
                setTimeout(() => {
                  egg.style.opacity = "0";
                  hatched.style.opacity = "1";
                  hatched.style.transform = "scale(1)";
                }, 380),
              );
          }, 250 + i * 430),
        );
      });
    };

    const hatchBtn = root.querySelector<HTMLButtonElement>("[data-hatch]");
    hatchBtn?.addEventListener("click", hatch);

    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
      hatchTimers.forEach((t) => clearTimeout(t));
      hatchBtn?.removeEventListener("click", hatch);
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
      {/* ===================== ACT I — THE WATCH ===================== */}
      <section
        className="scene"
        data-pin
        data-len="460"
        style={{ position: "relative", height: "460vh" }}
      >
        <div
          className="stage stage--intro"
          style={cssVars({
            position: "sticky",
            top: 0,
            height: "100vh",
            overflow: "hidden",
            background: "#FFFCFD",
            "--night": "#100D18",
            "--pText": "clamp(0, calc((0.36 - var(--p,0)) / 0.16), 1)",
            "--pLight": "clamp(0, calc((var(--p,0) - 0.16) / 0.30), 1)",
            "--pEyes": "clamp(0, calc((0.52 - var(--p,0)) / 0.16), 1)",
            "--pPet": "clamp(0, calc((var(--p,0) - 0.36) / 0.18), 1)",
            "--pName": "clamp(0, calc((var(--p,0) - 0.80) / 0.17), 1)",
          })}
        >
          {/* daylight wash + dots */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(125% 95% at 50% 8%, #FFF1F7, #FFFCFD 62%)",
              opacity: "var(--pLight,0)",
            }}
          />
          <div
            className="pd-dots"
            style={{
              position: "absolute",
              inset: 0,
              opacity: "calc(var(--pLight,0) * 0.7)",
            }}
          />

          {/* night layer */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(135% 105% at 50% 44%, #1d1832, var(--night,#100D18) 72%)",
              opacity: "calc(1 - var(--pLight,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "inset 0 0 240px 60px rgba(0,0,0,.6)",
              opacity: "calc(1 - var(--pLight,0))",
              pointerEvents: "none",
            }}
          />

          {/* creatures: demon eyes that become pets */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {CREATURES.map((c) => (
              <div
                key={c.pet}
                className="creature"
                style={cssVars({
                  position: "absolute",
                  left: c.left,
                  top: c.top,
                  width: "160px",
                  height: "120px",
                  "--i": c.i,
                  color: c.color,
                  "--away":
                    "clamp(0, calc((var(--p,0) - (0.60 + (var(--i) * 0.035))) / 0.18), 1)",
                  transform:
                    "translate(-50%, calc(-50% - var(--away,0) * 118vh)) rotate(calc(var(--away,0) * " +
                    c.rot +
                    "deg)) scale(calc(1 - var(--away,0) * 0.35))",
                  opacity: "calc(1 - var(--away,0))",
                  willChange: "transform",
                })}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform:
                      "translate(-50%,-50%) scale(calc(0.62 + var(--pEyes,1) * 0.38))",
                    opacity: "var(--pEyes,1)",
                  }}
                >
                  <EyePair c={c} />
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%) scale(var(--pPet,0))",
                    opacity: "var(--pPet,0)",
                  }}
                >
                  <PetAvatar pet={c.pet} size="xl" status={c.status} />
                </div>
              </div>
            ))}
          </div>

          {/* intro headline */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "0 6vw",
              pointerEvents: "none",
              opacity: "var(--pText,1)",
              transform: "translateY(calc((1 - var(--pText,1)) * -46px))",
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "#fff",
                fontSize: "clamp(40px,7.4vw,92px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.02,
                margin: 0,
                textShadow: "0 2px 50px rgba(0,0,0,.55)",
              }}
            >
              Development is over.
            </h1>
            <p
              style={{
                fontFamily: "var(--font-body)",
                color: "rgba(255,255,255,.5)",
                fontSize: "clamp(13px,1.4vw,17px)",
                letterSpacing: ".01em",
                margin: "22px 0 0",
              }}
            >
              something has been watching your codebase
            </p>
          </div>

          {/* name reveal */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "0 6vw",
              pointerEvents: "none",
              opacity: "var(--pName,0)",
              transform: "translateY(calc((1 - var(--pName,0)) * 26px))",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/petsdriven-mark.svg"
              alt=""
              style={{
                width: "clamp(64px,8vw,104px)",
                height: "auto",
                filter: "drop-shadow(0 16px 32px rgba(249,94,158,.35))",
                transform: "scale(calc(0.82 + var(--pName,0) * 0.18))",
              }}
            />
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--ink-950)",
                fontSize: "clamp(48px,9.5vw,108px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                margin: "20px 0 0",
              }}
            >
              Pets<span style={{ color: "var(--lavender-500)" }}>-</span>Driven
            </h2>
            <p
              className="pd-eyebrow"
              style={{ marginTop: 16, color: "var(--ink-500)" }}
            >
              a cute way to develop with AI agents
            </p>
          </div>

          {/* scroll cue */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 34,
              transform: "translateX(-50%)",
              opacity: "calc(var(--pText,1) * 0.9)",
              color: "rgba(255,255,255,.6)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              pointerEvents: "none",
            }}
          >
            <span>scroll</span>
            <span
              style={{
                fontSize: 18,
                animation: "pdScroll 1.7s ease-in-out infinite",
              }}
            >
              &#8595;
            </span>
          </div>
        </div>
      </section>

      {/* ===================== ACT II — PERSONALITIES ===================== */}
      <section className="scene" style={{ position: "relative" }}>
        <div
          className="stage"
          style={{
            position: "relative",
            minHeight: "100vh",
            overflow: "hidden",
            background: "#FFFCFD",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            className="pd-dots"
            style={{ position: "absolute", inset: 0, opacity: 0.5 }}
          />
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 1320,
              margin: "0 auto",
              padding: "0 6vw",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 56,
              alignItems: "center",
            }}
          >
            <div
              data-reveal
              style={{
                opacity: 0,
                transform: "translateY(28px)",
                transition:
                  "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)",
              }}
            >
              <span
                className="pd-eyebrow"
                style={{ color: "var(--blossom-600)" }}
              >
                The pack
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "clamp(34px,4.6vw,62px)",
                  lineHeight: 1.04,
                  letterSpacing: "-0.02em",
                  color: "var(--ink-950)",
                  margin: "14px 0 0",
                }}
              >
                Every pet has a<br />
                personality of its own.
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "clamp(16px,1.4vw,20px)",
                  lineHeight: 1.65,
                  color: "var(--ink-700)",
                  maxWidth: "46ch",
                  margin: "22px 0 0",
                }}
              >
                Some pets explore your desktop far and wide — bouncing, jumping,
                chasing things down. Others are shy: they peek out, sniff
                around, and dart back the moment you look.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 28,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: "var(--butter-100)", color: "var(--butter-600)", fontWeight: 700, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--butter-500)" }} />
                  Otto roams far
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: "var(--sky-100)", color: "var(--sky-700)", fontWeight: 700, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--sky-500)" }} />
                  Pip zooms about
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: "var(--blossom-100)", color: "var(--blossom-700)", fontWeight: 700, fontSize: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--blossom-500)" }} />
                  Mochi is shy
                </span>
              </div>
            </div>

            <div
              data-reveal
              style={{
                opacity: 0,
                transform: "translateY(28px)",
                transition:
                  "opacity .7s cubic-bezier(.22,1,.36,1) .1s, transform .7s cubic-bezier(.22,1,.36,1) .1s",
                position: "relative",
                height: 440,
              }}
            >
              {/* desk shadow */}
              <div style={{ position: "absolute", left: "50%", bottom: 46, transform: "translateX(-50%)", width: 300, height: 26, borderRadius: 999, background: "rgba(99,93,128,.16)", filter: "blur(8px)" }} />
              {/* monitor */}
              <div style={{ position: "absolute", left: "50%", bottom: 64, transform: "translateX(-50%)", width: 340, zIndex: 2 }}>
                <div style={{ height: 208, borderRadius: 20, background: "var(--term-bg)", border: "7px solid #fff", boxShadow: "0 18px 44px rgba(34,31,46,.18), inset 0 0 0 1px var(--border-soft)", padding: 18, overflow: "hidden" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--term-muted)" }}>
                    <div>
                      <span style={{ color: "var(--term-prompt)" }}>~</span> the den is open
                    </div>
                    <div style={{ color: "var(--term-accent)" }}>6 pets ready</div>
                    <div style={{ color: "var(--term-pink)" }}>pip is sniffing around…</div>
                    <div style={{ height: 8 }} />
                    <div style={{ opacity: 0.6 }}>idle · waiting for a task</div>
                  </div>
                </div>
                <div style={{ width: 78, height: 24, margin: "0 auto", background: "#fff", boxShadow: "inset 0 0 0 1px var(--border-soft)" }} />
                <div style={{ width: 140, height: 12, margin: "0 auto", borderRadius: 999, background: "#fff", boxShadow: "0 6px 14px rgba(34,31,46,.1), inset 0 0 0 1px var(--border-soft)" }} />
              </div>

              {/* Mochi peeking behind monitor */}
              <div style={{ position: "absolute", left: "64%", top: "30%", zIndex: 1, animation: "pdPeek 5.2s ease-in-out infinite" }}>
                <PetAvatar pet="mochi" size="lg" status="thinking" />
              </div>
              {/* Otto jumping top-left */}
              <div style={{ position: "absolute", left: "20%", top: "18%", zIndex: 3, animation: "pdJump 1.5s ease-in-out infinite" }}>
                <PetAvatar pet="otto" size="lg" status="working" />
              </div>
              {/* Cato sitting top-right */}
              <div style={{ position: "absolute", left: "66%", top: "14%", zIndex: 3, animation: "pdBobY 2.6s ease-in-out infinite" }}>
                <PetAvatar pet="cato" size="lg" status="happy" />
              </div>
              {/* Pip flying */}
              <div style={{ position: "absolute", left: "34%", top: "4%", zIndex: 4, animation: "pdFly 7.5s ease-in-out infinite" }}>
                <PetAvatar pet="pip" size="md" status="thinking" />
              </div>
              {/* Fenn on the desk */}
              <div style={{ position: "absolute", left: "8%", top: "66%", zIndex: 3, animation: "pdBobY 3.1s ease-in-out infinite" }}>
                <PetAvatar pet="fenn" size="lg" status="happy" />
              </div>

              {/* floating captions */}
              <div style={{ position: "absolute", left: "6%", top: "6%", padding: "6px 11px", borderRadius: 999, background: "#fff", boxShadow: "0 8px 20px rgba(34,31,46,.1)", fontSize: 12, fontWeight: 700, color: "var(--butter-600)", animation: "pdFloat 4s ease-in-out infinite" }}>
                jumps far!
              </div>
              <div style={{ position: "absolute", left: "80%", top: "38%", padding: "6px 11px", borderRadius: 999, background: "#fff", boxShadow: "0 8px 20px rgba(34,31,46,.1)", fontSize: 12, fontWeight: 700, color: "var(--blossom-600)", animation: "pdFloat 4.6s ease-in-out infinite" }}>
                shy…
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ACT V — SIMULATION SLOT ===================== */}
      <section
        style={{
          position: "relative",
          padding: "120px 6vw 130px",
          background: "linear-gradient(180deg,#FFFCFD,#F4F1FE)",
        }}
      >
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <div
            data-reveal
            style={{
              opacity: 0,
              transform: "translateY(26px)",
              transition:
                "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <span className="pd-eyebrow" style={{ color: "var(--teal-600)" }}>
              Preview
            </span>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(30px,4vw,54px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink-950)", margin: "12px 0 0" }}>
              Watch a pet decide what to do next.
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(16px,1.4vw,19px)", lineHeight: 1.6, color: "var(--ink-700)", maxWidth: "50ch", margin: "18px auto 0" }}>
              A live simulation of how a pet weighs its options and picks its
              next action.
            </p>
          </div>
          {/* Live behavior pipeline — the real decision simulation. */}
          <div
            data-reveal
            data-sim-slot
            style={{
              opacity: 0,
              transform: "translateY(26px)",
              transition:
                "opacity .7s cubic-bezier(.22,1,.36,1) .1s, transform .7s cubic-bezier(.22,1,.36,1) .1s",
              marginTop: 44,
            }}
          >
            <DecisionShowcaseApp />
          </div>
        </div>
      </section>

      {/* ===================== ACT IV — PLUGINS ===================== */}
      <section style={{ position: "relative", padding: "130px 6vw", background: "#FFFCFD" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            data-reveal
            style={{
              textAlign: "center",
              opacity: 0,
              transform: "translateY(26px)",
              transition:
                "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <span
              className="pd-eyebrow"
              style={{ color: "var(--lavender-600)" }}
            >
              Setup
            </span>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(30px,4vw,54px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink-950)", margin: "12px 0 0" }}>
              Hatch your pet with one command.
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(16px,1.4vw,19px)", lineHeight: 1.6, color: "var(--ink-700)", maxWidth: "54ch", margin: "18px auto 0" }}>
              Run a single command and watch your pet hatch right inside your
              terminal — personality and all.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24, margin: "54px auto 0", maxWidth: 780 }}>
            <div
              data-reveal
              style={{
                opacity: 0,
                transform: "translateY(26px)",
                transition:
                  "opacity .7s cubic-bezier(.22,1,.36,1) .08s, transform .7s cubic-bezier(.22,1,.36,1) .08s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--term-bg)", borderRadius: 14, padding: "8px 8px 8px 16px", boxShadow: "0 4px 0 #1b1733" }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--term-prompt)", fontSize: 14 }}>$</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--term-fg)", fontSize: 14, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>/pet-driven:hatch</span>
                <button
                  data-hatch
                  style={{
                    background: "var(--blossom-500)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9,
                    padding: "9px 20px",
                    fontFamily: "var(--font-body)",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    transition: "transform .14s ease, background .14s ease",
                  }}
                >
                  Run
                </button>
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--ink-500)", margin: "12px 0 0" }}>
                Run the command to hatch your pet.
              </p>
            </div>

            <div
              data-reveal
              style={{
                opacity: 0,
                transform: "translateY(26px)",
                transition:
                  "opacity .7s cubic-bezier(.22,1,.36,1) .16s, transform .7s cubic-bezier(.22,1,.36,1) .16s",
              }}
            >
              <div style={{ background: "#fff", borderRadius: 28, border: "1px solid var(--border-soft)", boxShadow: "0 18px 44px rgba(139,127,232,.14)", padding: 18, height: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
                {/* mini terminal */}
                <div style={{ background: "var(--term-bg)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 15px", background: "var(--term-bg-soft)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: "#FF7967" }} />
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: "#FBC24A" }} />
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: "#4FC894" }} />
                    <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--term-muted)" }}>your terminal — pets-driven</span>
                  </div>
                  <div data-hatch-out style={{ padding: "16px 18px", fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 1.7, color: "var(--term-fg)", minHeight: 178 }}>
                    <div style={{ color: "var(--term-muted)" }}>
                      → run <span style={{ color: "var(--term-pink)" }}>/pet-driven:hatch</span> to hatch your pet
                    </div>
                  </div>
                </div>
                {/* egg / hatched reveal */}
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 152 }}>
                  <div data-egg style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "opacity .4s ease", transformOrigin: "50% 92%" }}>
                    <div style={{ width: 60, height: 78, borderRadius: "50% 50% 50% 50% / 62% 62% 38% 38%", background: "linear-gradient(160deg,#FFF6FB,#FFE0EE)", boxShadow: "inset -5px -7px 0 rgba(249,94,158,.1), 0 10px 22px rgba(249,94,158,.16)", position: "relative" }}>
                      <span style={{ position: "absolute", top: 24, left: 14, width: 6, height: 6, borderRadius: 999, background: "var(--blossom-200)" }} />
                      <span style={{ position: "absolute", top: 40, left: 34, width: 5, height: 5, borderRadius: 999, background: "var(--blossom-200)" }} />
                      <span style={{ position: "absolute", top: 54, left: 18, width: 4, height: 4, borderRadius: 999, background: "var(--blossom-200)" }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: "var(--ink-400)" }}>waiting to hatch</div>
                  </div>
                  <div data-hatched style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0, transform: "scale(.4)", transition: "transform .55s cubic-bezier(.34,1.56,.64,1), opacity .4s ease" }}>
                    <PetAvatar pet="cato" size="xl" status="happy" ring />
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, color: "var(--ink-950)" }}>Cato</div>
                    <p data-summary style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.55, color: "var(--ink-700)", margin: 0, textAlign: "center", maxWidth: "30ch" }}>
                      Cato is curious and tidy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ACT VI — CTA ===================== */}
      <section style={{ position: "relative", padding: "30px 6vw 70px", background: "#FFFCFD" }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            background: "linear-gradient(165deg,#FFE0EE 0%,#F4F1FE 100%)",
            borderRadius: 40,
            padding: "78px 40px 70px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(249,94,158,.18)",
          }}
        >
          <div className="pd-dots" style={{ position: "absolute", inset: 0, opacity: 0.45 }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 6, marginBottom: 30, flexWrap: "wrap" }}>
              {CTA_PETS.map((p) => (
                <span key={p.pet} style={{ animation: "pdBobY 2.4s ease-in-out infinite", animationDelay: p.delay }}>
                  <PetAvatar pet={p.pet} size="lg" status={p.status} ring />
                </span>
              ))}
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(34px,5vw,68px)", lineHeight: 1.02, letterSpacing: "-0.02em", color: "var(--ink-950)", margin: 0 }}>
              Ready to send the pack?
            </h2>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "clamp(16px,1.5vw,20px)", lineHeight: 1.6, color: "var(--ink-700)", margin: "18px auto 0", maxWidth: "42ch" }}>
              Give your pets a task and watch them go. Development is over — the
              pack takes it from here.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 34, flexWrap: "wrap" }}>
              <Button variant="primary" size="lg">
                Adopt a pet
              </Button>
              <Button variant="ghost" size="lg">
                Meet the pets
              </Button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "46px auto 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--ink-500)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/petsdriven-mark.svg" alt="" style={{ width: 30, height: "auto" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, color: "var(--ink-800)" }}>
            Pets<span style={{ color: "var(--lavender-500)" }}>-</span>Driven
          </span>
          <span style={{ fontSize: 13 }}>· a cute way to develop with AI agents</span>
        </div>
      </section>
    </div>
  );
}
