import type { CSSProperties, ReactNode } from "react";
import { PetShowcaseCard, TerminalPreview } from "@pets-driven/design-system";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import {
  PET_CELL_SIZE,
  type PetAnimationState,
} from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { DemoPet } from "./fixtures";

export function DemoWindow({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={["pd-video-window", className].filter(Boolean).join(" ")}>
      <header className="pd-video-window__header">
        <span className="pd-video-window__dot pd-video-window__dot--red" />
        <span className="pd-video-window__dot pd-video-window__dot--yellow" />
        <span className="pd-video-window__dot pd-video-window__dot--green" />
        <strong>{title}</strong>
      </header>
      <div className="pd-video-window__body">{children}</div>
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
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="pd-video-callout" style={style}>
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
      status={{ label: "ready", dotColor: pet.color }}
    />
  );
}

export function DemoPetPortrait({ pet }: { pet: DemoPet }) {
  return (
    <img
      alt={`${pet.name} portrait`}
      className="pd-video-card-pet"
      src={`/codex-pets/${pet.assetId}/spritesheet.webp`}
    />
  );
}

export function DesktopPet({
  animationState,
  elapsedMs,
  facing = "right",
  label,
  pet,
  scale = 0.74,
  x,
  y,
}: {
  animationState: PetAnimationState;
  elapsedMs: number;
  facing?: "left" | "right";
  label?: string;
  pet: DemoPet;
  scale?: number;
  x: number;
  y: number;
}) {
  return (
    <div className="pd-video-desktop-pet" style={{ left: x, top: y }}>
      {label ? <div className="pd-video-status-card">{label}</div> : null}
      <PetSprite
        alt={`${pet.name} sprite`}
        animationState={animationState}
        elapsedMs={elapsedMs}
        facing={facing}
        imageUrl={`/codex-pets/${pet.assetId}/spritesheet.webp`}
        scale={scale}
        showStatusBubble={false}
        size={PET_CELL_SIZE}
      />
    </div>
  );
}

export function DemoTerminal({ cwd }: { cwd: string }) {
  return (
    <div className="pd-video-terminal">
      <TerminalPreview cwd={cwd} prompt="$" command="codex --workdir D:/pets-driven" />
      <div className="pd-video-terminal__line pd-video-terminal__line--success">
        Terminal channel activated for Cato
      </div>
      <div className="pd-video-terminal__line">
        Agent source ready in the bound working directory
      </div>
    </div>
  );
}
