# Product Pet Window Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a product-integrated Tauri Pet Window playground path that opens real transparent desktop overlay windows and renders one Codex pet per window.

**Architecture:** Rust creates and manages Pet Window `WebviewWindow`s from explicit commands. React routes `index.html?surface=pet-window` into a focused Pet Window view that loads a spritesheet, renders a pet canvas, and classifies body versus overlay pointer regions. Native click-through is toggled from the Pet Window when the pointer is outside the approximate hit region.

**Tech Stack:** Tauri 2, React 18, TypeScript, Vitest, HTML canvas, Codex pet 9-row atlas.

---

## File Structure

- Modify `src-tauri/src/lib.rs` to add Pet Window create/close commands.
- Modify `src-tauri/capabilities/default.json` to allow the new Pet Window labels to use core window/event APIs.
- Modify `src/app/pets-driven-app.tsx` to add management controls and route query parameters to the Pet Window view.
- Create `src/pet-window/pet-window-types.ts` for shared Pet Window payload and hit-action types.
- Create `src/pet-window/pet-window-hit-region.ts` for pure mask classification.
- Create `src/pet-window/pet-window-view.tsx` for the transparent Pet Window renderer and pointer handling.
- Modify `src/styles.css` for transparent Pet Window page styling and management controls.
- Add `tests/pet-window/pet-window-hit-region.test.ts` for body/overlay/transparent classification.
- Add `tests/pet-window/pet-window-routing.test.tsx` for query routing and management controls.

## Tasks

### Task 1: Pure Hit Region Classifier

**Files:**
- Create: `src/pet-window/pet-window-types.ts`
- Create: `src/pet-window/pet-window-hit-region.ts`
- Test: `tests/pet-window/pet-window-hit-region.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { classifyPetWindowPoint } from "@/pet-window/pet-window-hit-region";

describe("pet window hit region", () => {
  const layout = {
    width: 192,
    height: 208,
    body: { x: 42, y: 46, width: 108, height: 132 },
    overlay: { x: 54, y: 12, width: 84, height: 28 },
  };

  it("classifies body points as direct manipulation starts", () => {
    expect(classifyPetWindowPoint(layout, { x: 96, y: 112 })).toEqual({
      kind: "body",
      startsDirectManipulation: true,
    });
  });

  it("classifies overlay points as action-only", () => {
    expect(classifyPetWindowPoint(layout, { x: 96, y: 20 })).toEqual({
      kind: "overlay",
      startsDirectManipulation: false,
    });
  });

  it("lets transparent points pass through", () => {
    expect(classifyPetWindowPoint(layout, { x: 8, y: 8 })).toEqual({
      kind: "transparent",
      startsDirectManipulation: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test -- tests/pet-window/pet-window-hit-region.test.ts`

Expected: FAIL because `@/pet-window/pet-window-hit-region` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create the exported layout and classifier types, then return `overlay` before `body` so visible overlay masks do not start body dragging when the two regions overlap.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd run test -- tests/pet-window/pet-window-hit-region.test.ts`

Expected: PASS.

### Task 2: Product Route And Management Controls

**Files:**
- Modify: `src/app/pets-driven-app.tsx`
- Create: `tests/pet-window/pet-window-routing.test.tsx`

- [ ] **Step 1: Write failing routing tests**

Test that `window.location.search = "?surface=pet-window&petId=pet-a&assetId=patamon"` renders a Pet Window view instead of the management surface. Test that management buttons invoke `open_pet_window_playground` with counts `1` and `3`, and invoke `close_pet_window_playground`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test -- tests/pet-window/pet-window-routing.test.tsx`

Expected: FAIL because the Pet Window route and buttons do not exist.

- [ ] **Step 3: Implement minimal route and controls**

Use a helper inside `PetsDrivenApp` to parse `URLSearchParams`. In normal management mode, add buttons near the header. In Pet Window mode, render `PetWindowView` with the parsed payload.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd run test -- tests/pet-window/pet-window-routing.test.tsx`

Expected: PASS.

### Task 3: Pet Window Renderer

**Files:**
- Create: `src/pet-window/pet-window-view.tsx`
- Modify: `src/styles.css`
- Test: `tests/pet-window/pet-window-routing.test.tsx`

- [ ] **Step 1: Extend tests for renderer essentials**

Assert the Pet Window route renders a canvas with `aria-label="Pet Window pet-a"` and no management header. Mock the Tauri window API and assert transparent-region pointer movement calls `setIgnoreCursorEvents(true)`, while body movement calls `setIgnoreCursorEvents(false)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test -- tests/pet-window/pet-window-routing.test.tsx`

Expected: FAIL because `PetWindowView` does not exist.

- [ ] **Step 3: Implement minimal renderer**

Load the Codex pet image through existing asset-loading helpers, draw atlas frames on a transparent canvas, classify pointer movement with `classifyPetWindowPoint`, and call `getCurrentWindow().setIgnoreCursorEvents(...)` only inside Tauri.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd run test -- tests/pet-window/pet-window-routing.test.tsx tests/pet-window/pet-window-hit-region.test.ts`

Expected: PASS.

### Task 4: Native Tauri Pet Window Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Rust command tests if practical**

If the existing Tauri test harness can instantiate app state cheaply, add command-level tests for generated labels and close behavior. If not practical, keep Rust code small and verify with `cargo check`.

- [ ] **Step 2: Implement native commands**

Add `open_pet_window_playground(count: Option<u8>)` and `close_pet_window_playground()`. Clamp count to `1..=5`. Create labels like `pet-window-playground-1`. Use `WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html?surface=pet-window&petId=pet-a&assetId=patamon".into()))` with transparent, decorations false, always-on-top, skip-taskbar, resizable false, shadow false, and sprite-sized dimensions.

- [ ] **Step 3: Run Rust verification**

Run: `cd src-tauri; cargo check`

Expected: PASS.

### Task 5: Focused And Full Verification

**Files:**
- No additional files expected.

- [ ] **Step 1: Run focused tests**

Run: `npm.cmd run test -- tests/pet-window/pet-window-hit-region.test.ts tests/pet-window/pet-window-routing.test.tsx tests/pets/pet-atlas.test.ts tests/core/pet-animation-state.test.ts tests/playground/canvas-renderer.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm.cmd run test`

Expected: PASS.

- [ ] **Step 3: Run native app manually**

Run: `npm.cmd run dev`

Expected: Management window opens. The controls can open one or three transparent always-on-top Pet Windows.

- [ ] **Step 4: Native acceptance check**

Manually check that transparent pixels pass clicks through to apps behind the Pet Window, body clicks/drags are recognized, overlay clicks do not drag the pet, and three windows do not disrupt normal IDE/browser interaction.
