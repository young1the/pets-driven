import { PetShowcaseCard } from "@pets-driven/design-system";
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import { PetSpeechBubble } from "@pets-driven/pet-engine/pets/status/pet-speech-bubble";
import type { CSSProperties, ReactNode } from "react";
import { staticFile, useCurrentFrame } from "remotion";
import type { DemoPet, DemoPetPresentation } from "./fixtures";

export function DemoWindow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section className={["pd-video-window", className].filter(Boolean).join(" ")}>
      <header className="pd-video-window__header">
        <nav className="pd-video-window__tabs" aria-label="Demo tabs">
          <span className="pd-video-window__tab pd-video-window__tab--active">Home</span>
          <span className="pd-video-window__tab">Settings</span>
          <span className="pd-video-window__tab">Debug</span>
        </nav>
        <div className="pd-video-window__actions">
          <span>0 on the desktop</span>
          <strong>Show all</strong>
          <strong>Hide all</strong>
        </div>
      </header>
      <div className="pd-video-window__body">{children}</div>
    </section>
  );
}

export function DemoAppFrame({
  children,
  className = "",
  meta = "D:/pets-driven",
  style,
  title = "Pets-Driven",
}: {
  children: ReactNode;
  className?: string;
  meta?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <section className={["pd-video-app-frame", className].filter(Boolean).join(" ")} style={style}>
      <header className="pd-video-app-frame__bar">
        <div className="pd-video-app-frame__controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </header>
      <div className="pd-video-app-frame__body">{children}</div>
    </section>
  );
}

const CAPTION_SPARKLES: {
  amp: number;
  color: string;
  phase: number;
  size: number;
  speed: number;
  spin: number;
  x: number;
  y: number;
}[] = [
  {
    amp: 11,
    color: "var(--blossom-400)",
    phase: 0.4,
    size: 14,
    speed: 28,
    spin: 0.9,
    x: -150,
    y: 46,
  },
  {
    amp: 13,
    color: "var(--lavender-400)",
    phase: 2.1,
    size: 12,
    speed: 33,
    spin: -0.7,
    x: 156,
    y: 40,
  },
  {
    amp: 9,
    color: "var(--blossom-500)",
    phase: 3.6,
    size: 9,
    speed: 24,
    spin: 1.2,
    x: -74,
    y: -54,
  },
  {
    amp: 10,
    color: "var(--lavender-300)",
    phase: 1.2,
    size: 11,
    speed: 26,
    spin: -1.0,
    x: 92,
    y: -50,
  },
  { amp: 8, color: "var(--sky-300)", phase: 4.7, size: 8, speed: 22, spin: 0.8, x: 4, y: 60 },
  { amp: 12, color: "var(--mint-300)", phase: 5.5, size: 8, speed: 31, spin: 1.1, x: 214, y: -12 },
];

export function Caption({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  return (
    <div className="pd-video-caption" style={style}>
      <div className="pd-video-caption__sparkles" aria-hidden="true">
        {CAPTION_SPARKLES.map((s, index) => {
          const floatY = Math.sin(frame / s.speed + s.phase) * s.amp;
          const floatX = Math.cos(frame / (s.speed * 1.3) + s.phase) * (s.amp * 0.55);
          const rotate = frame * s.spin + s.phase * 40;
          const twinkle = 0.5 + 0.5 * Math.sin(frame / 13 + s.phase * 2);
          const scale = 0.82 + 0.18 * Math.sin(frame / 11 + s.phase);
          return (
            <span
              className="pd-video-caption__sparkle"
              // biome-ignore lint/suspicious/noArrayIndexKey: static positional decoration array that never reorders.
              key={index}
              style={{
                background: s.color,
                height: s.size,
                opacity: 0.35 + twinkle * 0.65,
                transform: `translate(-50%, -50%) translate(${s.x + floatX}px, ${s.y + floatY}px) rotate(${rotate}deg) scale(${scale})`,
                width: s.size,
              }}
            />
          );
        })}
      </div>
      <span className="pd-video-caption__text">{children}</span>
    </div>
  );
}

export function DemoCursor({ scale = 1, x, y }: { scale?: number; x: number; y: number }) {
  return (
    <svg
      aria-hidden="true"
      className="pd-video-cursor"
      height={42 * scale}
      style={{ left: x, top: y }}
      viewBox="0 0 32 42"
      width={32 * scale}
    >
      <path
        d="M4 3l21 21-12 1.5 7 12-5 2.8-7-12-7 8.8L4 3Z"
        fill="#fff"
        stroke="#181326"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function ClickBurst({ progress: p, x, y }: { progress: number; x: number; y: number }) {
  const ease = 1 - (1 - p) ** 3;
  const scale = 0.38 + ease * 0.98;
  const opacity = p < 0.14 ? p / 0.14 : 1 - (p - 0.14) / 0.86;
  const spikes = 12;
  return (
    <div
      className="pd-video-click-burst"
      style={{
        left: x,
        opacity: Math.max(0, opacity),
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      <svg aria-hidden="true" height="164" viewBox="-82 -82 164 164" width="164">
        {Array.from({ length: spikes }).map((_, index) => {
          const angle = (index / spikes) * Math.PI * 2;
          const long = index % 2 === 0;
          const inner = long ? 27 : 31;
          const outer = long ? 66 : 52;
          return (
            <line
              // biome-ignore lint/suspicious/noArrayIndexKey: static positional decoration array that never reorders.
              key={index}
              stroke="#181326"
              strokeLinecap="round"
              strokeWidth={long ? 8 : 6}
              x1={Math.cos(angle) * inner}
              x2={Math.cos(angle) * outer}
              y1={Math.sin(angle) * inner}
              y2={Math.sin(angle) * outer}
            />
          );
        })}
      </svg>
    </div>
  );
}

const POOF_PARTICLES: { angle: number; color: string; size: number }[] = [
  { angle: 0, color: "var(--blossom-400)", size: 10 },
  { angle: Math.PI / 4, color: "var(--lavender-400)", size: 8 },
  { angle: Math.PI / 2, color: "var(--sky-300)", size: 11 },
  { angle: (3 * Math.PI) / 4, color: "var(--mint-300)", size: 8 },
  { angle: Math.PI, color: "var(--blossom-500)", size: 10 },
  { angle: (5 * Math.PI) / 4, color: "var(--lavender-300)", size: 8 },
  { angle: (3 * Math.PI) / 2, color: "var(--sky-300)", size: 11 },
  { angle: (7 * Math.PI) / 4, color: "var(--mint-300)", size: 8 },
];

export function PoofBurst({ progress: p, x, y }: { progress: number; x: number; y: number }) {
  const ease = 1 - (1 - p) ** 2;
  const cloudScale = 0.4 + ease * 1.1;
  const cloudOpacity = p < 0.45 ? p / 0.45 : Math.max(0, 1 - (p - 0.45) / 0.55);
  const particleTravel = 18 + ease * 64;
  const particleOpacity = p < 0.2 ? p / 0.2 : Math.max(0, 1 - (p - 0.2) / 0.8);
  const particleScale = 1 - ease * 0.6;

  return (
    <div className="pd-video-poof" style={{ left: x, top: y }}>
      <div
        className="pd-video-poof__cloud"
        style={{
          opacity: cloudOpacity,
          transform: `translate(-50%, -50%) scale(${cloudScale})`,
        }}
      />
      {POOF_PARTICLES.map((particle, index) => (
        <span
          className="pd-video-poof__particle"
          // biome-ignore lint/suspicious/noArrayIndexKey: static positional decoration array that never reorders.
          key={index}
          style={{
            background: particle.color,
            height: particle.size,
            opacity: particleOpacity,
            transform: `translate(-50%, -50%) translate(${Math.cos(particle.angle) * particleTravel}px, ${Math.sin(particle.angle) * particleTravel}px) scale(${particleScale})`,
            width: particle.size,
          }}
        />
      ))}
    </div>
  );
}

const HEART_PARTICLES: { drift: number; delay: number; scale: number; tint: string }[] = [
  { delay: 0, drift: -46, scale: 1, tint: "var(--blossom-400)" },
  { delay: 0.14, drift: 34, scale: 0.76, tint: "var(--blossom-500)" },
  { delay: 0.26, drift: -14, scale: 0.9, tint: "var(--lavender-400)" },
  { delay: 0.38, drift: 58, scale: 0.64, tint: "var(--blossom-400)" },
  { delay: 0.5, drift: -66, scale: 0.7, tint: "var(--lavender-300)" },
];

/** The reward beat: hearts rising off a pet that has just been acknowledged. */
export function HeartBurst({ progress: p, x, y }: { progress: number; x: number; y: number }) {
  return (
    <div className="pd-video-heart-burst" style={{ left: x, top: y }}>
      {HEART_PARTICLES.map((heart) => {
        const local = Math.max(0, Math.min(1, (p - heart.delay) / (1 - heart.delay)));
        if (local <= 0) {
          return null;
        }
        const ease = 1 - (1 - local) ** 2;
        const opacity = local < 0.16 ? local / 0.16 : Math.max(0, 1 - (local - 0.16) / 0.84);
        return (
          <svg
            aria-hidden="true"
            className="pd-video-heart"
            height={30 * heart.scale}
            key={heart.delay}
            style={{
              opacity,
              // Kept short so the hearts never climb into the status card.
              transform: `translate(-50%, -50%) translate(${heart.drift * ease}px, ${-110 * ease}px) scale(${0.6 + ease * 0.5})`,
            }}
            viewBox="0 0 24 22"
            width={32 * heart.scale}
          >
            <path
              d="M12 21S1.8 14.4 1.8 7.7A5.7 5.7 0 0 1 12 4.3 5.7 5.7 0 0 1 22.2 7.7C22.2 14.4 12 21 12 21Z"
              fill={heart.tint}
              stroke="#181326"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        );
      })}
    </div>
  );
}

const DESKTOP_DOCK_APPS: { from: string; to: string }[] = [
  { from: "#FF9DB6", to: "#F16A90" },
  { from: "#FFD08A", to: "#F2A45E" },
  { from: "#8ECAF2", to: "#5AA9E6" },
  { from: "#8FE0BA", to: "#46B97E" },
  { from: "#BCABF5", to: "#A189EE" },
];

export function DesktopBackdrop() {
  return (
    <div className="pd-video-desktop" aria-hidden="true">
      <div className="pd-video-desktop__menubar">
        <span className="pd-video-desktop__brand">
          <span className="pd-video-desktop__logo" />
          Pets-Driven
        </span>
        <span className="pd-video-desktop__menu">File</span>
        <span className="pd-video-desktop__menu">View</span>
        <span className="pd-video-desktop__menu">Pack</span>
        <span className="pd-video-desktop__spacer" />
        <span className="pd-video-desktop__clock">01:25</span>
      </div>
      <div className="pd-video-desktop__icons">
        <div className="pd-video-desktop__icon">
          <span className="pd-video-desktop__glyph pd-video-desktop__glyph--folder" />
          pets-driven
        </div>
        <div className="pd-video-desktop__icon">
          <span className="pd-video-desktop__glyph pd-video-desktop__glyph--doc" />
          notes.md
        </div>
      </div>
      <div className="pd-video-desktop__dock">
        {DESKTOP_DOCK_APPS.map((app, index) => (
          <span
            className="pd-video-desktop__app"
            // biome-ignore lint/suspicious/noArrayIndexKey: static positional decoration array that never reorders.
            key={index}
            style={{ background: `linear-gradient(158deg, ${app.from}, ${app.to})` }}
          />
        ))}
      </div>
    </div>
  );
}

export function DemoPetCard({ featured = false, pet }: { featured?: boolean; pet: DemoPet }) {
  return (
    <PetShowcaseCard
      cwd={pet.cwd}
      featured={featured}
      gradient={pet.gradient}
      name={pet.name}
      note={pet.note}
      portrait={<DemoPetPortrait pet={pet} />}
      role={pet.role}
    />
  );
}

export function DemoPetPortrait({ pet }: { pet: DemoPet }) {
  return (
    <PetSprite
      alt={`${pet.name} portrait`}
      className="pd-video-card-pet"
      animationState="idle"
      elapsedMs={0}
      imageUrl={staticFile(`codex-pets/${pet.assetId}/spritesheet.webp`)}
      scale={0.58}
      showStatusBubble={false}
      size={PET_CELL_SIZE}
    />
  );
}

export function DesktopPet({
  elapsedMs,
  pet,
  presentation,
  scale = 0.74,
  x,
  y,
}: {
  elapsedMs: number;
  pet: DemoPet;
  presentation: DemoPetPresentation;
  scale?: number;
  x: number;
  y: number;
}) {
  // The product's own mapping. Label, mood and emote are all derived here, so
  // the video cannot show a state the desktop window would not produce.
  const status = presentPetStatus(
    presentation.animationState,
    presentation.overlay,
    presentation.activity,
    presentation.partnerName,
    presentation.working ?? false,
  );

  return (
    <div className="pd-video-desktop-pet" style={{ left: x, top: y }}>
      <PetSprite
        alt={`${pet.name} sprite`}
        animationState={presentation.animationState}
        decisionEmote={presentation.decisionEmote ?? null}
        elapsedMs={elapsedMs}
        imageUrl={staticFile(`codex-pets/${pet.assetId}/spritesheet.webp`)}
        scale={scale}
        // The capsule is placed by the video (it has to clear the caption and
        // the neighbouring pets), so PetSprite's own anchored bubble is off and
        // the same presentation is rendered through the same design-system
        // component just below.
        showStatusBubble={false}
        size={PET_CELL_SIZE}
      />
      {status.showCapsule ? (
        <div className="pd-video-status">
          <PetSpeechBubble
            message={status.message ?? undefined}
            mood={status.mood}
            work={status.label ?? undefined}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Typing beats are expressed relative to `typingStartFrame` so the terminal can
 * be retimed with its scene instead of pinning itself to absolute frames.
 */
export const TERMINAL_TYPING = {
  command: 0,
  attachLineVisible: 24,
  attach: 30,
  hatchLineVisible: 50,
  hatch: 56,
  tail: 62,
  softLine: 72,
  done: 82,
} as const;

export function DemoTerminal({
  className = "",
  cwd,
  typingStartFrame,
}: {
  className?: string;
  cwd: string;
  typingStartFrame: number;
}) {
  const frame = useCurrentFrame();
  const at = (offset: number) => typingStartFrame + offset;
  const command = "codex --workdir D:/pets-driven";
  const attach = "attached to Cato";
  const hatch = "/pets-driven:hatch";
  const commandText = revealText(command, frame, at(TERMINAL_TYPING.command), 1.6);
  const attachText = revealText(attach, frame, at(TERMINAL_TYPING.attach), 1.5);
  const hatchText = revealText(hatch, frame, at(TERMINAL_TYPING.hatch), 1.4);
  const showCommandCursor =
    frame >= at(TERMINAL_TYPING.command) && commandText.length < command.length;
  const showAttachCursor = frame >= at(TERMINAL_TYPING.attach) && attachText.length < attach.length;
  const showHatchCursor = frame >= at(TERMINAL_TYPING.hatch) && hatchText.length < hatch.length;

  return (
    <div className={["pd-video-terminal", className].filter(Boolean).join(" ")}>
      <div className="pd-video-terminal-shell">
        <div className="pd-video-terminal-shell__bar">
          <span className="pd-video-terminal-shell__dot pd-video-terminal-shell__dot--red" />
          <span className="pd-video-terminal-shell__dot pd-video-terminal-shell__dot--yellow" />
          <span className="pd-video-terminal-shell__dot pd-video-terminal-shell__dot--green" />
          <span className="pd-video-terminal-shell__title">your terminal - pets-driven</span>
        </div>
        <div className="pd-video-terminal-shell__body" data-hatch-out="true">
          <div className="pd-video-terminal-shell__cwd">{cwd}</div>
          <div className="pd-video-terminal-shell__line">
            <span className="pd-video-terminal-shell__prompt">$</span>{" "}
            <span className="pd-video-terminal-shell__command">{commandText}</span>
            {showCommandCursor ? <span className="pd-video-terminal-shell__cursor" /> : null}
          </div>
          <div
            className="pd-video-terminal-shell__line"
            style={{ opacity: frame >= at(TERMINAL_TYPING.attachLineVisible) ? 1 : 0 }}
          >
            <span className="pd-video-terminal-shell__hint">&gt; </span>
            <span className="pd-video-terminal-shell__text">{attachText}</span>
            {showAttachCursor ? <span className="pd-video-terminal-shell__cursor" /> : null}
          </div>
          <div
            className="pd-video-terminal-shell__line"
            style={{ opacity: frame >= at(TERMINAL_TYPING.hatchLineVisible) ? 1 : 0 }}
          >
            <span className="pd-video-terminal-shell__hint">-&gt; run </span>
            <span className="pd-video-terminal-shell__accent">{hatchText}</span>
            {showHatchCursor ? <span className="pd-video-terminal-shell__cursor" /> : null}
            <span
              className="pd-video-terminal-shell__text"
              style={{ opacity: frame >= at(TERMINAL_TYPING.tail) ? 1 : 0 }}
            >
              {" "}
              to hatch your pet
            </span>
          </div>
          <div
            className="pd-video-terminal-shell__line pd-video-terminal-shell__line--soft"
            style={{ opacity: frame >= at(TERMINAL_TYPING.softLine) ? 1 : 0 }}
          >
            Pack channel is live inside the bound workspace.
          </div>
          <div className="pd-video-terminal-shell__line pd-video-terminal-shell__line--spacer">
            &nbsp;
          </div>
        </div>
      </div>
    </div>
  );
}

function revealText(text: string, frame: number, startFrame: number, charsPerFrame: number) {
  const count = Math.max(0, Math.floor((frame - startFrame) * charsPerFrame));
  return text.slice(0, Math.min(text.length, count));
}
