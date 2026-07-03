# Service Demo Scene Headings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multipet-style scene headings that explain the summon, terminal, and multipet actions in the service demo video.

**Architecture:** Keep the change inside the existing Remotion composition by reusing the existing `Caption` component and driving visibility with frame-based timing in `ServiceDemoVideo.tsx`. Avoid new shared abstractions since the request only needs three scene-level text overlays.

**Tech Stack:** React, Remotion, existing service demo composition styles

---

### Task 1: Add scene-level captions

**Files:**
- Modify: `D:\pets-driven-remotion\apps\web\remotion\service-demo\ServiceDemoVideo.tsx`

- [ ] **Step 1: Add frame-timed caption visibility values**

Define caption progress values near the other scene timing constants so the summon, terminal, and multipet headings can fade independently.

- [ ] **Step 2: Render summon and terminal captions with the existing `Caption` component**

Insert top-centered captions for:
- `Summon a pet from your deck.`
- `Open its terminal with a double-click.`

Use the same centered placement pattern as the multipet caption.

- [ ] **Step 3: Keep the multipet caption and align all three captions visually**

Make sure all captions share the same top position, centered alignment, and fade behavior so the sequence reads like one editorial system.

- [ ] **Step 4: Re-render the video composition**

Run: `corepack pnpm --filter @pets-driven/web video:render`

Expected: Remotion render completes and updates `D:\pets-driven-remotion\workspaces\service-demo.mp4`
