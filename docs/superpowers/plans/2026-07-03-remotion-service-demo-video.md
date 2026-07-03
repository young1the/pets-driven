# Remotion Service Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 45-60 second Remotion product demo video that shows pet card deployment, pet double-click terminal activation, and multiple pets interacting on the desktop.

**Architecture:** Add a browser-safe Remotion composition under `apps/web/remotion/` that uses deterministic fixture data and existing Pets-Driven visual primitives. Keep Remotion-only timeline, cursor, caption, and scene adapters separate from production app state so the video can render without Tauri or live pointer input.

**Tech Stack:** React 18, Remotion 4, pnpm workspace, Next web package, `@pets-driven/design-system`, `@pets-driven/pet-engine`.

---

## File Structure

- Modify `apps/web/package.json`: add Remotion scripts and keep existing web scripts intact.
- Create `apps/web/remotion/index.tsx`: Remotion entry point and composition registration.
- Create `apps/web/remotion/service-demo/ServiceDemoVideo.tsx`: top-level timeline that renders the approved six-scene storyboard.
- Create `apps/web/remotion/service-demo/timeline.ts`: frame rate, dimensions, scene frame ranges, and interpolation helpers.
- Create `apps/web/remotion/service-demo/fixtures.ts`: deterministic pets, working directories, card data, terminal text, and motion paths.
- Create `apps/web/remotion/service-demo/components.tsx`: Remotion-only UI adapters for app window chrome, cursor, captions, callouts, terminal surface, cards, and desktop pet surfaces.
- Create `apps/web/remotion/service-demo/service-demo.css`: Remotion composition styling, importing the design system and reusing product-like visual language.

---

### Task 1: Finalize Remotion Package Setup

**Files:**
- Modify: `apps/web/package.json`
- Verify: `pnpm-lock.yaml`

- [ ] **Step 1: Inspect the current Remotion dependencies**

Run:

```powershell
corepack pnpm --filter @pets-driven/web list remotion @remotion/cli --depth 0
```

Expected: output includes `remotion 4.0.484` and `@remotion/cli 4.0.484`.

- [ ] **Step 2: Add Remotion scripts to the web package**

Modify `apps/web/package.json` so the scripts block includes these entries while preserving the existing scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "video:studio": "remotion studio remotion/index.tsx",
    "video:compositions": "remotion compositions remotion/index.tsx",
    "video:still": "remotion still remotion/index.tsx ServiceDemo ../../workspaces/service-demo-frame.png --frame=300",
    "video:render": "remotion render remotion/index.tsx ServiceDemo ../../workspaces/service-demo.mp4"
  }
}
```

- [ ] **Step 3: Verify package scripts resolve**

Run:

```powershell
corepack pnpm --filter @pets-driven/web exec remotion versions
```

Expected: exit code `0` and output includes `All packages have the correct version.`

- [ ] **Step 4: Commit package setup**

Run:

```powershell
git add apps/web/package.json pnpm-lock.yaml
git commit -m "[Chore] Add Remotion video tooling"
```

Expected: commit succeeds with only `apps/web/package.json` and `pnpm-lock.yaml` included.

---

### Task 2: Add Remotion Entry Point and Timeline Constants

**Files:**
- Create: `apps/web/remotion/index.tsx`
- Create: `apps/web/remotion/service-demo/timeline.ts`
- Create: `apps/web/remotion/service-demo/ServiceDemoVideo.tsx`
- Create: `apps/web/remotion/service-demo/service-demo.css`

- [ ] **Step 1: Create timeline constants**

Create `apps/web/remotion/service-demo/timeline.ts`:

```ts
export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_DURATION_FRAMES = 1800;

export type ServiceDemoScene =
  | "context"
  | "summon"
  | "activate"
  | "terminal"
  | "multi-pet"
  | "closing";

export type SceneRange = {
  id: ServiceDemoScene;
  from: number;
  duration: number;
};

export const SCENES: SceneRange[] = [
  { id: "context", from: 0, duration: 150 },
  { id: "summon", from: 150, duration: 390 },
  { id: "activate", from: 540, duration: 420 },
  { id: "terminal", from: 960, duration: 300 },
  { id: "multi-pet", from: 1260, duration: 480 },
  { id: "closing", from: 1740, duration: 60 },
];

export function progress(frame: number, from: number, duration: number) {
  return Math.max(0, Math.min(1, (frame - from) / duration));
}

export function easeOutCubic(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return 1 - (1 - bounded) ** 3;
}

export function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}
```

- [ ] **Step 2: Create initial composition component**

Create `apps/web/remotion/service-demo/ServiceDemoVideo.tsx`:

```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";
import "./service-demo.css";

export function ServiceDemoVideo() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill className="pd-video">
      <div className="pd-video__background" />
      <main className="pd-video__stage" data-frame={frame}>
        <h1 className="pd-video__boot-title">Pets-Driven</h1>
        <p className="pd-video__boot-subtitle">
          Your agents, visible on your desktop.
        </p>
      </main>
    </AbsoluteFill>
  );
}
```

- [ ] **Step 3: Create Remotion entry point**

Create `apps/web/remotion/index.tsx`:

```tsx
import { Composition } from "remotion";
import { ServiceDemoVideo } from "./service-demo/ServiceDemoVideo";
import {
  VIDEO_DURATION_FRAMES,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./service-demo/timeline";

export default function RemotionRoot() {
  return (
    <Composition
      component={ServiceDemoVideo}
      durationInFrames={VIDEO_DURATION_FRAMES}
      fps={VIDEO_FPS}
      height={VIDEO_HEIGHT}
      id="ServiceDemo"
      width={VIDEO_WIDTH}
    />
  );
}
```

- [ ] **Step 4: Add base video CSS**

Create `apps/web/remotion/service-demo/service-demo.css`:

```css
@import "@pets-driven/design-system/styles.css";

* {
  box-sizing: border-box;
}

.pd-video {
  overflow: hidden;
  background: #fffcfd;
  color: var(--ink-950);
  font-family: var(--font-body);
}

.pd-video__background {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 12%, rgba(255, 224, 238, 0.8), transparent 32%),
    radial-gradient(circle at 88% 20%, rgba(244, 241, 254, 0.95), transparent 30%),
    radial-gradient(var(--ink-200) 1.2px, transparent 1.2px) 0 0 / 26px 26px,
    #fffcfd;
}

.pd-video__stage {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 72px;
}

.pd-video__boot-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 112px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 0.95;
}

.pd-video__boot-subtitle {
  margin: 24px 0 0;
  color: var(--ink-600);
  font-size: 34px;
  font-weight: 700;
}
```

- [ ] **Step 5: Verify composition discovery**

Run:

```powershell
corepack pnpm --filter @pets-driven/web video:compositions
```

Expected: exit code `0` and output includes `ServiceDemo`.

- [ ] **Step 6: Commit entry point**

Run:

```powershell
git add apps/web/package.json apps/web/remotion/index.tsx apps/web/remotion/service-demo/ServiceDemoVideo.tsx apps/web/remotion/service-demo/timeline.ts apps/web/remotion/service-demo/service-demo.css
git commit -m "[Feature] Add service demo video entry"
```

Expected: commit succeeds.

---

### Task 3: Add Deterministic Demo Fixtures

**Files:**
- Create: `apps/web/remotion/service-demo/fixtures.ts`

- [ ] **Step 1: Create fixture types and data**

Create `apps/web/remotion/service-demo/fixtures.ts`:

```ts
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";

export type DemoPet = {
  id: string;
  name: string;
  assetId: "cato" | "otto" | "mochi" | "fenn" | "bloop" | "pip";
  note: string;
  role: string;
  cwd: string;
  gradient: { from: string; to: string };
  color: string;
};

export type PetMotionKeyframe = {
  frame: number;
  x: number;
  y: number;
  animationState: PetAnimationState;
  facing?: "left" | "right";
};

export const DEMO_PETS: DemoPet[] = [
  {
    id: "cato",
    name: "Cato",
    assetId: "cato",
    note: "curious and tidy",
    role: "frontend",
    cwd: "D:/pets-driven",
    gradient: { from: "#FFE0EE", to: "#F4F1FE" },
    color: "#a189ee",
  },
  {
    id: "otto",
    name: "Otto",
    assetId: "otto",
    note: "steady reviewer",
    role: "tests",
    cwd: "D:/pets-driven/apps/desktop",
    gradient: { from: "#FFF3C7", to: "#DFF8EF" },
    color: "#fbc24a",
  },
  {
    id: "pip",
    name: "Pip",
    assetId: "pip",
    note: "fast explorer",
    role: "docs",
    cwd: "D:/pets-driven/docs",
    gradient: { from: "#DBF2FF", to: "#E9F7EF" },
    color: "#5fb2ea",
  },
];

export const TERMINAL_LINES = [
  { prompt: "$", text: "codex --workdir D:/pets-driven", tone: "command" },
  { prompt: ">", text: "Terminal channel activated for Cato", tone: "success" },
  { prompt: ">", text: "Agent source ready in the bound working directory", tone: "muted" },
] as const;

export const MULTI_PET_PATHS: Record<string, PetMotionKeyframe[]> = {
  cato: [
    { frame: 1260, x: 420, y: 650, animationState: "running-right", facing: "right" },
    { frame: 1500, x: 780, y: 650, animationState: "running-right", facing: "right" },
    { frame: 1740, x: 960, y: 620, animationState: "waving", facing: "right" },
  ],
  otto: [
    { frame: 1260, x: 1320, y: 650, animationState: "running-left", facing: "left" },
    { frame: 1500, x: 1040, y: 650, animationState: "running-left", facing: "left" },
    { frame: 1740, x: 1160, y: 620, animationState: "jumping", facing: "left" },
  ],
  pip: [
    { frame: 1260, x: 960, y: 460, animationState: "running-right", facing: "right" },
    { frame: 1500, x: 1180, y: 390, animationState: "running-right", facing: "right" },
    { frame: 1740, x: 1480, y: 500, animationState: "review", facing: "right" },
  ],
};
```

- [ ] **Step 2: Verify the fixture module typechecks in isolation**

Run:

```powershell
corepack pnpm --filter @pets-driven/web exec tsc --noEmit --skipLibCheck remotion/service-demo/fixtures.ts
```

Expected: exit code `0`.

- [ ] **Step 3: Commit fixtures**

Run:

```powershell
git add apps/web/remotion/service-demo/fixtures.ts
git commit -m "[Feature] Add service demo video fixtures"
```

Expected: commit succeeds.

---

### Task 4: Build Remotion Scene Components

**Files:**
- Create: `apps/web/remotion/service-demo/components.tsx`
- Modify: `apps/web/remotion/service-demo/service-demo.css`

- [ ] **Step 1: Create product demo components**

Create `apps/web/remotion/service-demo/components.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { PetShowcaseCard, TerminalPreview } from "@pets-driven/design-system";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { PET_CELL_SIZE, type PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
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

export function DemoCursor({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
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

export function DemoPetCard({ pet, featured = false }: { pet: DemoPet; featured?: boolean }) {
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
```

- [ ] **Step 2: Add component CSS**

Append to `apps/web/remotion/service-demo/service-demo.css`:

```css
.pd-video-window {
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: 28px;
  background: rgba(255, 252, 253, 0.92);
  box-shadow: 0 30px 90px rgba(77, 68, 116, 0.18);
}

.pd-video-window__header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-soft);
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink-600);
  font-size: 14px;
  font-weight: 800;
}

.pd-video-window__dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
}

.pd-video-window__dot--red { background: #ff7967; }
.pd-video-window__dot--yellow { background: #fbc24a; }
.pd-video-window__dot--green { background: #4fc894; }

.pd-video-window__body {
  position: relative;
  min-height: 100%;
}

.pd-video-caption {
  position: absolute;
  z-index: 30;
  max-width: 760px;
  color: var(--ink-950);
  font-family: var(--font-display);
  font-size: 58px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.04;
}

.pd-video-callout {
  position: absolute;
  z-index: 40;
  padding: 12px 18px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow-lg);
  color: var(--ink-800);
  font-size: 22px;
  font-weight: 850;
}

.pd-video-cursor {
  position: absolute;
  z-index: 80;
  overflow: visible;
  filter: drop-shadow(0 10px 14px rgba(24, 19, 38, 0.22));
}

.pd-video-card-pet {
  width: 126px;
  height: 136px;
  object-fit: cover;
  object-position: left top;
  image-rendering: pixelated;
}

.pd-video-desktop-pet {
  position: absolute;
  z-index: 20;
  transform: translate(-50%, -100%);
}

.pd-video-status-card {
  position: absolute;
  left: 50%;
  top: -44px;
  z-index: 5;
  transform: translateX(-50%);
  white-space: nowrap;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow-md);
  color: var(--ink-800);
  font-size: 15px;
  font-weight: 850;
  padding: 8px 13px;
}

.pd-video-terminal {
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 22px;
  background: var(--term-bg);
  box-shadow: 0 20px 54px rgba(24, 19, 38, 0.26);
}

.pd-video-terminal__line {
  color: var(--term-muted);
  font-family: var(--font-mono);
  font-size: 18px;
}

.pd-video-terminal__line--success {
  color: var(--mint-300);
}
```

- [ ] **Step 3: Run composition discovery**

Run:

```powershell
corepack pnpm --filter @pets-driven/web video:compositions
```

Expected: exit code `0` and output includes `ServiceDemo`.

- [ ] **Step 4: Commit scene components**

Run:

```powershell
git add apps/web/remotion/service-demo/components.tsx apps/web/remotion/service-demo/service-demo.css
git commit -m "[Feature] Add service demo scene components"
```

Expected: commit succeeds.

---

### Task 5: Implement the Six-Scene Timeline

**Files:**
- Modify: `apps/web/remotion/service-demo/ServiceDemoVideo.tsx`
- Modify: `apps/web/remotion/service-demo/service-demo.css`

- [ ] **Step 1: Replace the boot screen with the full timeline**

Replace `apps/web/remotion/service-demo/ServiceDemoVideo.tsx` with:

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DemoPetCard, DemoTerminal, DemoWindow, Caption, Callout, DemoCursor, DesktopPet } from "./components";
import { DEMO_PETS, MULTI_PET_PATHS, type PetMotionKeyframe } from "./fixtures";
import { easeOutCubic, lerp, progress } from "./timeline";
import "./service-demo.css";

const cato = DEMO_PETS[0];
const otto = DEMO_PETS[1];
const pip = DEMO_PETS[2];

export function ServiceDemoVideo() {
  const frame = useCurrentFrame();
  const contextP = progress(frame, 0, 150);
  const summonP = progress(frame, 150, 390);
  const activateP = progress(frame, 540, 420);
  const terminalP = progress(frame, 960, 300);
  const multiP = progress(frame, 1260, 480);
  const closingP = progress(frame, 1740, 60);

  const dragP = easeOutCubic(progress(frame, 210, 210));
  const cardX = lerp(0, 420, dragP);
  const cardY = lerp(0, -360, dragP);
  const petReveal = progress(frame, 450, 120);
  const cursor = cursorPosition(frame);

  return (
    <AbsoluteFill className="pd-video">
      <div className="pd-video__background" />
      <main className="pd-video__stage">
        <Caption style={{ left: 84, top: 78, opacity: interpolate(contextP, [0, 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          Your agents, visible on your desktop.
        </Caption>

        <DemoWindow className="pd-video-main-window" title="Pets-Driven">
          <div className="pd-video-home">
            <div className="pd-video-home__copy">
              <span>Your pack</span>
              <h2>Good morning,<br />Trainer!</h2>
              <button type="button">Add a pet</button>
            </div>
            <div className="pd-video-card-fan">
              <div className="pd-video-card pd-video-card--left">
                <DemoPetCard pet={otto} />
              </div>
              <div
                className="pd-video-card pd-video-card--center"
                style={{
                  transform: `translate(calc(-50% + ${cardX}px), ${cardY}px) rotate(${lerp(0, -5, dragP)}deg) scale(${lerp(1, 1.06, dragP)})`,
                  zIndex: 20,
                }}
              >
                <DemoPetCard featured={dragP > 0.2} pet={cato} />
              </div>
              <div className="pd-video-card pd-video-card--right">
                <DemoPetCard pet={pip} />
              </div>
            </div>
          </div>
        </DemoWindow>

        <Callout style={{ left: 1030, top: 260, opacity: summonP > 0.08 && summonP < 0.82 ? 1 : 0 }}>
          Drag a pet card to summon it.
        </Callout>

        {petReveal > 0 ? (
          <DesktopPet
            animationState={frame < 900 ? "waving" : "idle"}
            elapsedMs={frame * 33}
            label={activateP > 0.15 ? "Cato · D:/pets-driven" : undefined}
            pet={cato}
            scale={0.78}
            x={1260}
            y={720}
          />
        ) : null}

        <Callout style={{ left: 1120, top: 596, opacity: activateP > 0.12 && activateP < 0.45 ? 1 : 0 }}>
          Double-click the pet.
        </Callout>

        <section
          className="pd-video-terminal-zone"
          style={{
            opacity: interpolate(terminalP, [0, 0.28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            transform: `translateY(${lerp(60, 0, easeOutCubic(terminalP))}px)`,
          }}
        >
          <DemoTerminal cwd={cato.cwd} />
          <Callout style={{ position: "relative", left: 0, top: 18 }}>
            Terminal channel activated.
          </Callout>
        </section>

        <section
          className="pd-video-multi"
          style={{ opacity: interpolate(multiP, [0, 0.14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}
        >
          <Caption style={{ left: 84, top: 120 }}>Each pet carries one working directory.</Caption>
          {DEMO_PETS.map((pet) => {
            const pose = poseForPath(MULTI_PET_PATHS[pet.id], frame);
            return (
              <DesktopPet
                animationState={pose.animationState}
                elapsedMs={frame * 33}
                facing={pose.facing}
                key={pet.id}
                label={pet.name}
                pet={pet}
                scale={0.68}
                x={pose.x}
                y={pose.y}
              />
            );
          })}
        </section>

        <section
          className="pd-video-closing"
          style={{ opacity: closingP }}
        >
          <h2>Send the pack.</h2>
          <div>
            <DesktopPet animationState="waving" elapsedMs={frame * 33} pet={cato} scale={0.52} x={0} y={0} />
            <DesktopPet animationState="jumping" elapsedMs={frame * 33} pet={otto} scale={0.52} x={160} y={18} />
            <DesktopPet animationState="review" elapsedMs={frame * 33} pet={pip} scale={0.52} x={320} y={0} />
          </div>
        </section>

        <DemoCursor x={cursor.x} y={cursor.y} scale={cursor.scale} />
      </main>
    </AbsoluteFill>
  );
}

function cursorPosition(frame: number) {
  if (frame < 210) return { x: 820, y: 820, scale: 1 };
  if (frame < 420) {
    const p = easeOutCubic(progress(frame, 210, 210));
    return { x: lerp(820, 1260, p), y: lerp(820, 478, p), scale: 1 };
  }
  if (frame < 660) return { x: 1260, y: 650, scale: 1 };
  if (frame < 760) {
    const pulse = frame % 20 < 10 ? 0.88 : 1;
    return { x: 1260, y: 650, scale: pulse };
  }
  return { x: 1500, y: 880, scale: 1 };
}

function poseForPath(path: PetMotionKeyframe[], frame: number): PetMotionKeyframe {
  if (frame <= path[0].frame) return path[0];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    if (frame >= current.frame && frame <= next.frame) {
      const p = easeOutCubic(progress(frame, current.frame, next.frame - current.frame));
      return {
        frame,
        x: lerp(current.x, next.x, p),
        y: lerp(current.y, next.y, p),
        animationState: p > 0.9 ? next.animationState : current.animationState,
        facing: next.facing ?? current.facing,
      };
    }
  }
  return path[path.length - 1];
}
```

- [ ] **Step 2: Add timeline layout CSS**

Append to `apps/web/remotion/service-demo/service-demo.css`:

```css
.pd-video-main-window {
  position: absolute;
  left: 84px;
  top: 224px;
  width: 960px;
  height: 720px;
}

.pd-video-home {
  position: relative;
  height: 666px;
  overflow: hidden;
  background-image: radial-gradient(var(--ink-200) 1.4px, transparent 1.4px);
  background-size: 22px 22px;
}

.pd-video-home__copy {
  position: absolute;
  left: 72px;
  top: 86px;
}

.pd-video-home__copy span {
  color: var(--blossom-600);
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.pd-video-home__copy h2 {
  margin: 20px 0 26px;
  color: var(--ink-950);
  font-family: var(--font-display);
  font-size: 58px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.04;
}

.pd-video-home__copy button {
  border: 0;
  border-radius: var(--radius-md);
  background: var(--blossom-500);
  color: white;
  font-size: 19px;
  font-weight: 900;
  padding: 15px 24px;
}

.pd-video-card-fan {
  position: absolute;
  right: 430px;
  bottom: 64px;
}

.pd-video-card {
  position: absolute;
  bottom: 0;
  width: 224px;
  transform-origin: bottom center;
}

.pd-video-card--left {
  transform: translate(-170px, 34px) rotate(-8deg);
}

.pd-video-card--center {
  left: 0;
}

.pd-video-card--right {
  transform: translate(170px, 34px) rotate(8deg);
}

.pd-video-terminal-zone {
  position: absolute;
  right: 98px;
  bottom: 92px;
  width: 610px;
  z-index: 50;
}

.pd-video-multi {
  position: absolute;
  inset: 0;
  z-index: 60;
  background:
    linear-gradient(180deg, rgba(255, 252, 253, 0.94), rgba(244, 241, 254, 0.96)),
    radial-gradient(var(--ink-200) 1.2px, transparent 1.2px) 0 0 / 26px 26px;
}

.pd-video-multi::after {
  content: "";
  position: absolute;
  left: 120px;
  right: 120px;
  bottom: 236px;
  height: 2px;
  background: rgba(112, 104, 151, 0.18);
}

.pd-video-closing {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  background: linear-gradient(165deg, #ffe0ee 0%, #f4f1fe 100%);
}

.pd-video-closing h2 {
  margin: 0 0 180px;
  color: var(--ink-950);
  font-family: var(--font-display);
  font-size: 96px;
  font-weight: 600;
  letter-spacing: 0;
}

.pd-video-closing > div {
  position: relative;
  width: 360px;
  height: 220px;
}
```

- [ ] **Step 3: Run composition discovery**

Run:

```powershell
corepack pnpm --filter @pets-driven/web video:compositions
```

Expected: exit code `0` and output includes `ServiceDemo`.

- [ ] **Step 4: Render a smoke-test still**

Run:

```powershell
corepack pnpm --filter @pets-driven/web video:still
```

Expected: exit code `0` and `workspaces/service-demo-frame.png` exists.

- [ ] **Step 5: Commit timeline implementation**

Run:

```powershell
git add apps/web/remotion/service-demo/ServiceDemoVideo.tsx apps/web/remotion/service-demo/service-demo.css workspaces/service-demo-frame.png
git commit -m "[Feature] Implement service demo video timeline"
```

Expected: commit succeeds. If `workspaces/service-demo-frame.png` is ignored or too large for repo policy, remove it from the index with `git reset -- workspaces/service-demo-frame.png` and commit only source files.

---

### Task 6: Verify Renderability and Document Usage

**Files:**
- Modify: `apps/web/README.md`

- [ ] **Step 1: Add video usage documentation**

Append this section to `apps/web/README.md`:

```md
## Remotion Service Demo

The service introduction video lives in `remotion/index.tsx` and exposes the `ServiceDemo` composition.

Useful commands:

- `pnpm --filter @pets-driven/web video:studio` starts Remotion Studio.
- `pnpm --filter @pets-driven/web video:compositions` lists available compositions.
- `pnpm --filter @pets-driven/web video:still` renders a smoke-test still frame to `workspaces/service-demo-frame.png`.
- `pnpm --filter @pets-driven/web video:render` renders the demo video to `workspaces/service-demo.mp4`.
```

- [ ] **Step 2: Run Remotion verification**

Run:

```powershell
corepack pnpm --filter @pets-driven/web exec remotion versions
corepack pnpm --filter @pets-driven/web video:compositions
corepack pnpm --filter @pets-driven/web video:still
```

Expected:

- `remotion versions` exits `0`.
- `video:compositions` exits `0` and lists `ServiceDemo`.
- `video:still` exits `0` and writes `workspaces/service-demo-frame.png`.

- [ ] **Step 3: Run source checks**

Run:

```powershell
corepack pnpm --filter @pets-driven/web exec tsc --noEmit --skipLibCheck remotion/index.tsx remotion/service-demo/ServiceDemoVideo.tsx remotion/service-demo/components.tsx remotion/service-demo/fixtures.ts remotion/service-demo/timeline.ts
```

Expected: exit code `0`.

- [ ] **Step 4: Record baseline limitation**

Run:

```powershell
corepack pnpm --filter @pets-driven/web typecheck
```

Expected: this may fail on the existing design-system PNG module resolution issue mentioned in the design spec. If it fails only on that known issue, do not change unrelated design-system files in this video task.

- [ ] **Step 5: Commit docs and verification adjustments**

Run:

```powershell
git add apps/web/README.md
git commit -m "[Docs] Document Remotion service demo commands"
```

Expected: commit succeeds.

---

## Final Verification

Run:

```powershell
git status --short --branch
corepack pnpm --filter @pets-driven/web exec remotion versions
corepack pnpm --filter @pets-driven/web video:compositions
corepack pnpm --filter @pets-driven/web video:still
```

Expected:

- Git status contains no uncommitted source changes except intentionally generated render artifacts if they are ignored.
- Remotion package versions are consistent.
- `ServiceDemo` is discoverable.
- A still frame renders successfully.

Report the known `@pets-driven/web typecheck` baseline if it remains blocked by existing PNG module resolution errors.

