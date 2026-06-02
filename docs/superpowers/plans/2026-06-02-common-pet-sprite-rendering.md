# Common Pet Sprite Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared pet sprite rendering layer so canvas, Pet Window, and HTML views use the same atlas frame, semantic intent, mirror, and sizing rules.

**Architecture:** Keep the `$hatch-pet` atlas row contract in `pet-atlas.ts`, add a `src/pets/rendering/` layer that resolves semantic sprite intent into atlas frames, then expose surface-specific adapters for canvas and HTML. Existing renderers stop recalculating atlas and mirror rules directly.

**Tech Stack:** TypeScript, React 18, HTML canvas, Vitest, `$hatch-pet` 9-row atlas.

---

## File Structure

- Create `src/pets/rendering/pet-sprite-intent.ts`
  - Defines semantic presentation intent such as `travel/right`, `travel/left`, and `working`.
  - Maps semantic intent to existing `PetAnimationState` atlas rows.
- Create `src/pets/rendering/pet-sprite-frame.ts`
  - Resolves animation state or semantic intent into a concrete source rectangle, destination size, and mirror flag.
- Create `src/pets/rendering/pet-sprite-canvas.ts`
  - Draws a resolved sprite frame onto a canvas without knowing atlas rules.
- Create `src/pets/rendering/pet-sprite-html.tsx`
  - Renders a resolved sprite frame in HTML/React without knowing atlas rules.
- Create `tests/pets/pet-sprite-rendering.test.tsx`
  - Covers semantic intent mapping, frame resolution, canvas adapter behavior, and HTML adapter output.
- Modify `src/playground/browser/canvas-renderer.ts`
  - Use `resolvePetSpriteFrame` and `drawPetSpriteCanvas` instead of direct `getAtlasFrame`, `PET_CELL_SIZE`, and `shouldMirrorSprite` handling.
- Modify `src/pet-window/pet-window-view.tsx`
  - Use semantic intent and the shared canvas adapter for Pet Window sprite drawing.
- Modify `src/pets/assets/codex-pet-fixtures.ts`
  - Move `AssetCatalog` import to the new rendering layer so pet assets do not depend on the playground renderer.
- Modify `tests/playground/canvas-renderer.test.ts`
  - Keep existing behavior expectations passing under the new adapter.

## Task 1: Semantic Sprite Intent

**Files:**
- Create: `src/pets/rendering/pet-sprite-intent.ts`
- Test: `tests/pets/pet-sprite-rendering.test.tsx`

- [ ] **Step 1: Write the failing semantic intent tests**

Create `tests/pets/pet-sprite-rendering.test.tsx`:

```ts
import { describe, expect, it } from "vitest";
import {
  animationStateFromSpriteIntent,
  type PetSpriteIntent,
} from "@/pets/rendering/pet-sprite-intent";

describe("pet sprite rendering", () => {
  it("maps semantic travel and working intents to hatch-pet atlas states", () => {
    expect(animationStateFromSpriteIntent({ kind: "travel", direction: "right" })).toBe("running-right");
    expect(animationStateFromSpriteIntent({ kind: "travel", direction: "left" })).toBe("running-left");
    expect(animationStateFromSpriteIntent({ kind: "working" })).toBe("running");
  });

  it("maps direct status intents to matching hatch-pet atlas states", () => {
    const statuses: PetSpriteIntent[] = [
      { kind: "idle" },
      { kind: "waving" },
      { kind: "jumping" },
      { kind: "failed" },
      { kind: "waiting" },
      { kind: "review" },
    ];

    expect(statuses.map(animationStateFromSpriteIntent)).toEqual([
      "idle",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "review",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: FAIL because `@/pets/rendering/pet-sprite-intent` does not exist.

- [ ] **Step 3: Implement semantic intent mapping**

Create `src/pets/rendering/pet-sprite-intent.ts`:

```ts
import type { PetAnimationState } from "@/pets/assets/pet-atlas";

export type PetSpriteIntent =
  | { kind: "travel"; direction: "left" | "right" }
  | { kind: "working" }
  | { kind: "idle" }
  | { kind: "waving" }
  | { kind: "jumping" }
  | { kind: "failed" }
  | { kind: "waiting" }
  | { kind: "review" };

export function animationStateFromSpriteIntent(
  intent: PetSpriteIntent,
): PetAnimationState {
  switch (intent.kind) {
    case "travel":
      return intent.direction === "right" ? "running-right" : "running-left";
    case "working":
      return "running";
    default:
      return intent.kind;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pets/rendering/pet-sprite-intent.ts tests/pets/pet-sprite-rendering.test.tsx
git commit -m "feat: add semantic pet sprite intent"
```

## Task 2: Shared Sprite Frame Resolver

**Files:**
- Create: `src/pets/rendering/pet-sprite-frame.ts`
- Modify: `tests/pets/pet-sprite-rendering.test.tsx`

- [ ] **Step 1: Extend tests for frame resolution**

Append these imports:

```ts
import { resolvePetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";
```

Append these tests inside the existing `describe` block:

```ts
  it("resolves semantic intent to source rectangle and draw size", () => {
    expect(resolvePetSpriteFrame({
      intent: { kind: "travel", direction: "right" },
      elapsedMs: 0,
      size: { width: 32, height: 38 },
    })).toMatchObject({
      animationState: "running-right",
      frameIndex: 0,
      rowIndex: 1,
      source: { x: 0, y: 208, width: 192, height: 208 },
      drawSize: { width: 32, height: 38 },
      mirror: false,
    });
  });

  it("scales draw size without changing atlas source size", () => {
    expect(resolvePetSpriteFrame({
      animationState: "waiting",
      elapsedMs: 320,
      size: { width: 40, height: 50 },
      scale: 1.12,
    })).toMatchObject({
      animationState: "waiting",
      frameIndex: 2,
      rowIndex: 6,
      source: { x: 384, y: 1248, width: 192, height: 208 },
      drawSize: { width: 44.8, height: 56 },
    });
  });

  it("mirrors only single-direction states when facing right", () => {
    expect(resolvePetSpriteFrame({
      animationState: "jumping",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    }).mirror).toBe(true);

    expect(resolvePetSpriteFrame({
      animationState: "running-right",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    }).mirror).toBe(false);

    expect(resolvePetSpriteFrame({
      intent: { kind: "working" },
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    }).mirror).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: FAIL because `pet-sprite-frame.ts` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/pets/rendering/pet-sprite-frame.ts`:

```ts
import {
  getAtlasFrame,
  PET_CELL_SIZE,
  shouldMirrorSprite,
  type PetAnimationState,
  type PetSpriteFacing,
} from "@/pets/assets/pet-atlas";
import {
  animationStateFromSpriteIntent,
  type PetSpriteIntent,
} from "@/pets/rendering/pet-sprite-intent";

export type PetSpriteSize = {
  width: number;
  height: number;
};

export type PetSpriteFrameInput = {
  animationState?: PetAnimationState;
  intent?: PetSpriteIntent;
  elapsedMs: number;
  facing?: PetSpriteFacing;
  size: PetSpriteSize;
  scale?: number;
};

export type PetSpriteFrame = {
  animationState: PetAnimationState;
  frameIndex: number;
  rowIndex: number;
  source: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  drawSize: PetSpriteSize;
  mirror: boolean;
};

export function resolvePetSpriteFrame(
  input: PetSpriteFrameInput,
): PetSpriteFrame {
  const animationState =
    input.intent
      ? animationStateFromSpriteIntent(input.intent)
      : input.animationState ?? "idle";
  const atlasFrame = getAtlasFrame(
    animationState,
    input.elapsedMs,
    input.facing,
  );
  const scale = input.scale ?? 1;

  return {
    animationState,
    frameIndex: atlasFrame.frameIndex,
    rowIndex: atlasFrame.rowIndex,
    source: {
      x: atlasFrame.sourceX,
      y: atlasFrame.sourceY,
      width: PET_CELL_SIZE.width,
      height: PET_CELL_SIZE.height,
    },
    drawSize: {
      width: input.size.width * scale,
      height: input.size.height * scale,
    },
    mirror: shouldMirrorSprite(animationState, input.facing),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx tests/pets/pet-atlas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pets/rendering/pet-sprite-frame.ts tests/pets/pet-sprite-rendering.test.tsx
git commit -m "feat: resolve shared pet sprite frames"
```

## Task 3: Canvas Sprite Adapter

**Files:**
- Create: `src/pets/rendering/pet-sprite-canvas.ts`
- Modify: `tests/pets/pet-sprite-rendering.test.tsx`

- [ ] **Step 1: Extend tests for canvas drawing**

Append these imports:

```ts
import { vi } from "vitest";
import { drawPetSpriteCanvas, type AssetCatalog } from "@/pets/rendering/pet-sprite-canvas";
```

Append this test inside the existing `describe` block:

```ts
  it("draws resolved frames on canvas and applies mirror around center", () => {
    const context = {
      drawImage: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;
    const frame = resolvePetSpriteFrame({
      animationState: "jumping",
      elapsedMs: 0,
      facing: "right",
      size: { width: 32, height: 38 },
    });

    drawPetSpriteCanvas(context, image, frame, { x: 100, y: 80 });

    expect(context.save).toHaveBeenCalledBefore(context.scale);
    expect(context.translate).toHaveBeenCalledWith(100, 80);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      0,
      832,
      192,
      208,
      -16,
      -19,
      32,
      38,
    );
    expect(context.restore).toHaveBeenCalledAfter(context.drawImage);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: FAIL because `pet-sprite-canvas.ts` does not exist.

- [ ] **Step 3: Implement the canvas adapter**

Create `src/pets/rendering/pet-sprite-canvas.ts`:

```ts
import type { PetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";

export type AssetCatalog = Record<string, HTMLImageElement>;

export type PetSpriteCanvasPosition = {
  x: number;
  y: number;
};

export function drawPetSpriteCanvas(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: PetSpriteFrame,
  position: PetSpriteCanvasPosition,
) {
  if (frame.mirror) {
    context.save();
    context.translate(position.x, position.y);
    context.scale(-1, 1);
    context.drawImage(
      image,
      frame.source.x,
      frame.source.y,
      frame.source.width,
      frame.source.height,
      -frame.drawSize.width / 2,
      -frame.drawSize.height / 2,
      frame.drawSize.width,
      frame.drawSize.height,
    );
    context.restore();
    return;
  }

  context.drawImage(
    image,
    frame.source.x,
    frame.source.y,
    frame.source.width,
    frame.source.height,
    position.x - frame.drawSize.width / 2,
    position.y - frame.drawSize.height / 2,
    frame.drawSize.width,
    frame.drawSize.height,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pets/rendering/pet-sprite-canvas.ts tests/pets/pet-sprite-rendering.test.tsx
git commit -m "feat: add canvas pet sprite adapter"
```

## Task 4: HTML Sprite Adapter

**Files:**
- Create: `src/pets/rendering/pet-sprite-html.tsx`
- Modify: `tests/pets/pet-sprite-rendering.test.tsx`

- [ ] **Step 1: Extend tests for HTML rendering**

Append these imports:

```ts
import { render, screen } from "@testing-library/react";
import { PetSpriteHtml } from "@/pets/rendering/pet-sprite-html";
```

Append this test inside the existing `describe` block:

```ts
  it("renders a resolved frame as clipped HTML", () => {
    const frame = resolvePetSpriteFrame({
      animationState: "waiting",
      elapsedMs: 320,
      facing: "right",
      size: { width: 32, height: 38 },
    });

    render(
      <PetSpriteHtml
        alt="Waiting pet"
        frame={frame}
        imageUrl="/fallback-pets/patamon/spritesheet.webp"
      />,
    );

    const root = screen.getByLabelText("Waiting pet");

    expect(root).toHaveStyle({
      width: "32px",
      height: "38px",
      overflow: "hidden",
      backgroundImage: "url(/fallback-pets/patamon/spritesheet.webp)",
      backgroundPosition: "-64px -228px",
      backgroundSize: "256px 342px",
      transform: "scaleX(-1)",
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: FAIL because `pet-sprite-html.tsx` does not exist.

- [ ] **Step 3: Implement the HTML adapter**

Create `src/pets/rendering/pet-sprite-html.tsx`:

```tsx
import { PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import type { PetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";

type PetSpriteHtmlProps = {
  imageUrl: string;
  frame: PetSpriteFrame;
  alt: string;
  className?: string;
};

export function PetSpriteHtml({
  imageUrl,
  frame,
  alt,
  className,
}: PetSpriteHtmlProps) {
  const scaleX = frame.drawSize.width / frame.source.width;
  const scaleY = frame.drawSize.height / frame.source.height;
  const backgroundWidth = PET_CELL_SIZE.width * 8 * scaleX;
  const backgroundHeight = PET_CELL_SIZE.height * 9 * scaleY;

  return (
    <span
      aria-label={alt}
      className={className}
      style={{
        backgroundImage: `url(${imageUrl})`,
        backgroundPosition: `${-frame.source.x * scaleX}px ${-frame.source.y * scaleY}px`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${backgroundWidth}px ${backgroundHeight}px`,
        display: "inline-block",
        height: `${frame.drawSize.height}px`,
        overflow: "hidden",
        transform: frame.mirror ? "scaleX(-1)" : undefined,
        transformOrigin: "center",
        width: `${frame.drawSize.width}px`,
      }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pets/rendering/pet-sprite-html.tsx tests/pets/pet-sprite-rendering.test.tsx
git commit -m "feat: add html pet sprite adapter"
```

## Task 5: Move Asset Catalog Type Out Of Playground

**Files:**
- Modify: `src/pets/assets/codex-pet-fixtures.ts`
- Modify: `src/playground/browser/playground-app.tsx`

- [ ] **Step 1: Change asset catalog imports**

In `src/pets/assets/codex-pet-fixtures.ts`, replace:

```ts
import type { AssetCatalog } from "@/playground/browser/canvas-renderer";
```

with:

```ts
import type { AssetCatalog } from "@/pets/rendering/pet-sprite-canvas";
```

In `src/playground/browser/playground-app.tsx`, replace:

```ts
import type { AssetCatalog } from "./canvas-renderer";
```

with:

```ts
import type { AssetCatalog } from "@/pets/rendering/pet-sprite-canvas";
```

- [ ] **Step 2: Run TypeScript-sensitive tests**

Run:

```bash
npm.cmd run test -- tests/pets/codex-pet-fixtures.test.ts tests/smoke/playground-app.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pets/assets/codex-pet-fixtures.ts src/playground/browser/playground-app.tsx
git commit -m "refactor: move pet asset catalog type"
```

## Task 6: Use Shared Renderer In Playground Canvas

**Files:**
- Modify: `src/playground/browser/canvas-renderer.ts`
- Test: `tests/playground/canvas-renderer.test.ts`

- [ ] **Step 1: Update canvas renderer imports**

In `src/playground/browser/canvas-renderer.ts`, replace:

```ts
import {
  getAtlasFrame,
  PET_CELL_SIZE,
  shouldMirrorSprite,
} from "@/pets/assets/pet-atlas";
```

with:

```ts
import {
  drawPetSpriteCanvas,
  type AssetCatalog,
} from "@/pets/rendering/pet-sprite-canvas";
import { resolvePetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";
```

Remove the local `export type AssetCatalog = Record<string, HTMLImageElement>;`.

- [ ] **Step 2: Replace sprite drawing branch**

Inside the `if (sprite)` block, replace the manual `scale`, `drawWidth`, `drawHeight`, `getAtlasFrame`, `shouldMirrorSprite`, and `context.drawImage` logic with:

```ts
      const frame = resolvePetSpriteFrame({
        animationState: body.animationState ?? "idle",
        elapsedMs,
        facing: body.spriteFacing,
        size: { width: body.width, height: body.height },
        scale: body.interaction?.scale,
      });
      const { width: drawWidth, height: drawHeight } = frame.drawSize;

      drawPetSpriteCanvas(
        context,
        sprite,
        frame,
        { x: body.x, y: body.y },
      );
      drawHeldAgentState(context, body.x, body.y, drawWidth, drawHeight, matchingHeldState(snapshot, body.id));
      drawInteractionOutline(context, body.x, body.y, drawWidth, drawHeight, body.interaction);
      continue;
```

- [ ] **Step 3: Run renderer tests**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx tests/playground/canvas-renderer.test.ts
```

Expected: PASS. Existing `drawImage` expectations should stay the same because the adapter preserves source and destination coordinates.

- [ ] **Step 4: Commit**

```bash
git add src/playground/browser/canvas-renderer.ts tests/playground/canvas-renderer.test.ts
git commit -m "refactor: use shared pet sprite canvas renderer"
```

## Task 7: Use Semantic Intent In Pet Window

**Files:**
- Modify: `src/pet-window/pet-window-view.tsx`
- Modify: `tests/pet-window/pet-window-routing.test.tsx`

- [ ] **Step 1: Update Pet Window imports**

In `src/pet-window/pet-window-view.tsx`, replace:

```ts
import { getAtlasFrame, PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
```

with:

```ts
import { PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import { drawPetSpriteCanvas } from "@/pets/rendering/pet-sprite-canvas";
import { resolvePetSpriteFrame } from "@/pets/rendering/pet-sprite-frame";
```

- [ ] **Step 2: Replace Pet Window frame drawing**

Inside the `draw` callback, replace:

```ts
          const frame = getAtlasFrame(
            autonomousDirectionRef.current >= 0
              ? "running-right"
              : "running-left",
            elapsedMs,
          );
          context.clearRect(0, 0, PET_CELL_SIZE.width, PET_CELL_SIZE.height);
          context.drawImage(
            image,
            frame.sourceX,
            frame.sourceY,
            PET_CELL_SIZE.width,
            PET_CELL_SIZE.height,
            0,
            0,
            PET_CELL_SIZE.width,
            PET_CELL_SIZE.height,
          );
```

with:

```ts
          const frame = resolvePetSpriteFrame({
            intent: {
              kind: "travel",
              direction: autonomousDirectionRef.current >= 0 ? "right" : "left",
            },
            elapsedMs,
            size: PET_CELL_SIZE,
          });
          context.clearRect(0, 0, PET_CELL_SIZE.width, PET_CELL_SIZE.height);
          drawPetSpriteCanvas(
            context,
            image,
            frame,
            {
              x: PET_CELL_SIZE.width / 2,
              y: PET_CELL_SIZE.height / 2,
            },
          );
```

- [ ] **Step 3: Run Pet Window route tests**

Run:

```bash
npm.cmd run test -- tests/pet-window/pet-window-routing.test.tsx tests/pets/pet-sprite-rendering.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pet-window/pet-window-view.tsx tests/pet-window/pet-window-routing.test.tsx
git commit -m "refactor: use shared sprite intent in pet window"
```

## Task 8: Final Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run focused sprite and renderer tests**

Run:

```bash
npm.cmd run test -- tests/pets/pet-sprite-rendering.test.tsx tests/pets/pet-atlas.test.ts tests/core/pet-animation-state.test.ts tests/playground/canvas-renderer.test.ts tests/pet-window/pet-window-routing.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```bash
npm.cmd run test
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated worktree changes remain, or no changes if this plan was executed in an isolated clean worktree.

## Self-Review

Spec coverage:

- Shared frame, mirror, and sizing rules are covered by Tasks 2 and 3.
- Semantic `travel/right`, `travel/left`, and `working` mapping is covered by Task 1.
- Canvas adapter is covered by Task 3 and adopted in Task 6.
- HTML adapter is covered by Task 4.
- Pet Window adoption is covered by Task 7.
- Asset fallback behavior is preserved because Task 5 only moves a type import.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps remain.

Type consistency:

- `PetSpriteIntent`, `animationStateFromSpriteIntent`, `PetSpriteFrame`, `resolvePetSpriteFrame`, `drawPetSpriteCanvas`, `AssetCatalog`, and `PetSpriteHtml` names are introduced before they are referenced by later tasks.
