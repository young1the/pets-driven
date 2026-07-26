import { Button, PetAvatar, type PetAvatarStatus, type PetName } from "@pets-driven/design-system";
import type { Locale } from "@pets-driven/i18n/config";
import { getServerTranslation } from "@pets-driven/i18n/server";
import { IntroScenes } from "@/components/IntroScenes";

const CTA_PETS: PetName[] = ["cato", "otto", "mochi", "fenn", "bloop", "pip"];

/**
 * GitHub redirects this to the newest release's asset of that exact name, so the
 * CTA hands over the installer itself instead of dropping visitors on a release
 * page to hunt for it. The release workflow attaches the version-less copy.
 */
const DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
  "https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe";

/**
 * Pets-Driven Intro — the official homepage.
 * A faithful React port of the "Pets-Driven Intro" scroll-driven design:
 *   ACT I   The Watch — demon eyes in the dark resolve into the pack as light rises
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
  {
    pet: "cato",
    status: "working",
    left: "15%",
    top: "33%",
    i: 0,
    color: "#A189EE",
    rot: 36,
    eyeW: 140,
    eyeH: 65,
    blink: "4.4s",
    delay: ".1s",
  },
  {
    pet: "pip",
    status: "thinking",
    left: "84%",
    top: "26%",
    i: 1,
    color: "#5FB2EA",
    rot: -30,
    eyeW: 116,
    eyeH: 54,
    blink: "5.1s",
    delay: ".7s",
  },
  {
    pet: "mochi",
    status: "happy",
    left: "62%",
    top: "15%",
    i: 2,
    color: "#FF7FB4",
    rot: 28,
    eyeW: 124,
    eyeH: 58,
    blink: "3.8s",
    delay: "1.3s",
  },
  {
    pet: "fenn",
    status: "happy",
    left: "78%",
    top: "64%",
    i: 3,
    color: "#FF7967",
    rot: -38,
    eyeW: 132,
    eyeH: 62,
    blink: "4.7s",
    delay: ".4s",
  },
  {
    pet: "otto",
    status: "working",
    left: "24%",
    top: "71%",
    i: 4,
    color: "#FBC24A",
    rot: 34,
    eyeW: 138,
    eyeH: 64,
    blink: "4.1s",
    delay: "1s",
  },
  {
    pet: "bloop",
    status: "thinking",
    left: "88%",
    top: "52%",
    i: 5,
    color: "#4FC894",
    rot: -26,
    eyeW: 128,
    eyeH: 60,
    blink: "5.4s",
    delay: ".2s",
  },
];

function EyePair({ c }: { c: Creature }) {
  return (
    <svg
      aria-hidden="true"
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

export default function Intro({ locale }: { locale: Locale }) {
  const { t } = getServerTranslation(locale, "landing");

  return (
    <IntroScenes>
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
              background: "radial-gradient(125% 95% at 50% 8%, #FFF1F7, #FFFCFD 62%)",
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
                  width: "220px",
                  height: "170px",
                  "--i": c.i,
                  color: c.color,
                  "--away": "clamp(0, calc((var(--p,0) - (0.60 + (var(--i) * 0.035))) / 0.18), 1)",
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
                    transform: "translate(-50%,-50%) scale(calc(0.62 + var(--pEyes,1) * 0.38))",
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
                    transform: "translate(-50%,-50%) scale(calc(0.68 + var(--pPet,0) * 0.32))",
                    opacity: "var(--pPet,0)",
                  }}
                >
                  <PetAvatar
                    pet={c.pet}
                    size="xl"
                    status={c.status}
                    style={{ width: 136, height: 136 }}
                  />
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
              {t("hero.headline")}
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
              {t("hero.watching")}
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
            {/* biome-ignore lint/performance/noImgElement: inline SVG wordmark; next/image adds no benefit for a static SVG. */}
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
            <p className="pd-eyebrow" style={{ marginTop: 16, color: "var(--ink-500)" }}>
              {t("hero.tagline")}
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
            <span>{t("hero.scroll")}</span>
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

      {/* ===================== DEMO — SEE IT IN ACTION ===================== */}
      <section style={{ position: "relative", padding: "120px 6vw 130px", background: "#FFFCFD" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", textAlign: "center" }}>
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
              {t("demo.eyebrow")}
            </span>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "clamp(30px,4vw,54px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--ink-950)",
                margin: "12px 0 0",
              }}
            >
              {t("demo.title")}
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "clamp(16px,1.4vw,19px)",
                lineHeight: 1.6,
                color: "var(--ink-700)",
                maxWidth: "52ch",
                margin: "18px auto 0",
              }}
            >
              {t("demo.body")}
            </p>
          </div>
          <div
            data-reveal
            style={{
              opacity: 0,
              transform: "translateY(26px)",
              transition:
                "opacity .7s cubic-bezier(.22,1,.36,1) .1s, transform .7s cubic-bezier(.22,1,.36,1) .1s",
              marginTop: 44,
              borderRadius: 28,
              overflow: "hidden",
              border: "1px solid var(--border-soft)",
              boxShadow: "0 18px 44px rgba(139,127,232,.18)",
              background: "#FFFCFD",
            }}
          >
            <video
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              poster="/service-demo-poster.png"
              style={{ display: "block", width: "100%", height: "auto", aspectRatio: "16 / 9" }}
            >
              <source src="/service-demo.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      {/* ===================== CTA — ADOPT YOUR PACK ===================== */}
      <section style={{ padding: "24px 6vw 100px", background: "#FFFCFD" }}>
        <div
          data-reveal
          className="pd-dots"
          style={{
            opacity: 0,
            transform: "translateY(26px)",
            transition:
              "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)",
            maxWidth: 1140,
            margin: "0 auto",
            textAlign: "center",
            padding: "60px 32px",
            borderRadius: "var(--radius-2xl)",
            border: "1px solid var(--blossom-100)",
            background: "linear-gradient(160deg, var(--teal-50), var(--blossom-50))",
          }}
        >
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 22 }}>
            {CTA_PETS.map((pet) => (
              <PetAvatar key={pet} pet={pet} size="lg" status="happy" />
            ))}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "clamp(30px,4vw,44px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "var(--ink-950)",
              margin: 0,
            }}
          >
            {t("cta.title")}
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 18,
              color: "var(--ink-700)",
              margin: "14px 0 28px",
            }}
          >
            {t("cta.body")}
          </p>
          <Button variant="accent" size="lg" as="a" href={DOWNLOAD_URL}>
            {t("cta.button")}
          </Button>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--ink-700)",
              margin: "16px 0 0",
            }}
          >
            {t("cta.note")}{" "}
            <a
              href={process.env.NEXT_PUBLIC_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--blossom-600)" }}
            >
              {t("cta.sourceLink")}
            </a>
          </p>
        </div>
      </section>
    </IntroScenes>
  );
}
