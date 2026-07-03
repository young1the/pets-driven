import type { CSSProperties, ReactNode } from "react";
import { staticFile, useCurrentFrame } from "remotion";
import { PetEmote, type PetEmoteKind, PetShowcaseCard } from "@pets-driven/design-system";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import {
  PET_CELL_SIZE,
  type PetAnimationState,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { DemoPet } from "./fixtures";

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
    <section
      className={["pd-video-app-frame", className].filter(Boolean).join(" ")}
      style={style}
    >
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

export function Caption({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="pd-video-caption" style={style}>
      {children}
    </div>
  );
}

export function Callout({
  className = "",
  children,
  style,
}: {
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={["pd-video-callout", className].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}

export function DemoCursor({
  scale = 1,
  x,
  y,
}: {
  scale?: number;
  x: number;
  y: number;
}) {
  return (
    <svg
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

export function DemoPetCard({
  featured = false,
  pet,
}: {
  featured?: boolean;
  pet: DemoPet;
}) {
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
  animationState,
  emoteKind,
  elapsedMs,
  facing = "right",
  pet,
  scale = 0.74,
  x,
  y,
}: {
  animationState: PetAnimationState;
  emoteKind?: PetEmoteKind;
  elapsedMs: number;
  facing?: "left" | "right";
  pet: DemoPet;
  scale?: number;
  x: number;
  y: number;
}) {
  return (
    <div className="pd-video-desktop-pet" style={{ left: x, top: y }}>
      {emoteKind ? (
        <PetEmote className="pd-video-pet-emote" kind={emoteKind} size="sm" />
      ) : null}
      <PetSprite
        alt={`${pet.name} sprite`}
        animationState={animationState}
        elapsedMs={elapsedMs}
        facing={facing}
        imageUrl={staticFile(`codex-pets/${pet.assetId}/spritesheet.webp`)}
        scale={scale}
        showStatusBubble={false}
        size={PET_CELL_SIZE}
      />
    </div>
  );
}

export function DemoTerminal({
  className = "",
  cwd,
}: {
  className?: string;
  cwd: string;
}) {
  const frame = useCurrentFrame();
  const command = "codex --workdir D:/pets-driven";
  const attach = "attached to Cato";
  const hatch = "/pet-driven:hatch";
  const commandText = revealText(command, frame, 420, 1.25);
  const attachText = revealText(attach, frame, 462, 1.4);
  const hatchText = revealText(hatch, frame, 498, 1.3);
  const showCommandCursor = frame >= 420 && commandText.length < command.length;
  const showAttachCursor = frame >= 462 && attachText.length < attach.length;
  const showHatchCursor = frame >= 498 && hatchText.length < hatch.length;

  return (
    <div className={["pd-video-terminal", className].filter(Boolean).join(" ")}>
      <div className="pd-video-terminal-shell">
        <div className="pd-video-terminal-shell__bar">
          <span className="pd-video-terminal-shell__dot pd-video-terminal-shell__dot--red" />
          <span className="pd-video-terminal-shell__dot pd-video-terminal-shell__dot--yellow" />
          <span className="pd-video-terminal-shell__dot pd-video-terminal-shell__dot--green" />
          <span className="pd-video-terminal-shell__title">
            your terminal - pets-driven
          </span>
        </div>
        <div className="pd-video-terminal-shell__body" data-hatch-out="true">
          <div className="pd-video-terminal-shell__cwd">{cwd}</div>
          <div className="pd-video-terminal-shell__line">
            <span className="pd-video-terminal-shell__prompt">$</span>{" "}
            <span className="pd-video-terminal-shell__command">{commandText}</span>
            {showCommandCursor ? (
              <span className="pd-video-terminal-shell__cursor" />
            ) : null}
          </div>
          <div
            className="pd-video-terminal-shell__line"
            style={{ opacity: frame >= 452 ? 1 : 0 }}
          >
            <span className="pd-video-terminal-shell__hint">&gt; </span>
            <span className="pd-video-terminal-shell__text">{attachText}</span>
            {showAttachCursor ? (
              <span className="pd-video-terminal-shell__cursor" />
            ) : null}
          </div>
          <div
            className="pd-video-terminal-shell__line"
            style={{ opacity: frame >= 490 ? 1 : 0 }}
          >
            <span className="pd-video-terminal-shell__hint">-&gt; run </span>
            <span className="pd-video-terminal-shell__accent">{hatchText}</span>
            {showHatchCursor ? (
              <span className="pd-video-terminal-shell__cursor" />
            ) : null}
            <span
              className="pd-video-terminal-shell__text"
              style={{ opacity: frame > 528 ? 1 : 0 }}
            >
              {" "}to hatch your pet
            </span>
          </div>
          <div
            className="pd-video-terminal-shell__line pd-video-terminal-shell__line--soft"
            style={{ opacity: frame >= 548 ? 1 : 0 }}
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

function revealText(
  text: string,
  frame: number,
  startFrame: number,
  charsPerFrame: number,
) {
  const count = Math.max(0, Math.floor((frame - startFrame) * charsPerFrame));
  return text.slice(0, Math.min(text.length, count));
}
