# Desktop Main v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop app's developer dashboard with the "Desktop Main v2" management window (top nav + Home / Pet edit / Settings / Debug), wired to real app state.

**Architecture:** Reusable, art-agnostic pieces (`PetShowcaseCard`, `SegmentedControl`, `TerminalPreview`) are added to `@pets-driven/design-system` first. The desktop app composes them into four section components under `apps/desktop/src/app/main-window/`, driven by props from `pets-driven-app.tsx` (which keeps owning all state, effects, and Tauri calls). Live pet status comes from the adopted-pet world snapshot the main window already simulates.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (+ @testing-library/react / jsdom in the desktop app), pnpm workspaces, Tauri.

## Global Constraints

- All code comments, JSDoc, and committed docs in English (AGENTS.md). Commit messages in English.
- Commit message first line uses `[기타] <title>` (no issue number); body is a `-` list of real logic changes; never add a `Co-Authored-By:` line (user CLAUDE.md).
- Run `npx prettier --write <files>` before each commit.
- Design system stays art-agnostic: components never import app sprites/assets; pet art is passed in as a slot/children (memory: pets-driven-monorepo-design-system).
- Import sibling packages by package name (`@pets-driven/design-system`, `@pets-driven/pet-engine/...`), never by relative path across packages.
- Design system unit tests run in the `node` Vitest env (token mirror only); new DS components are presentational and are verified by `pnpm -r typecheck` plus the desktop app's jsdom smoke tests — do **not** add jsdom/testing-library deps to the design-system package.
- Do not change `schemaVersion`; the new `memo` field is an additive optional field.
- Faithful port: keep the source design's inline styles and CSS-variable token references verbatim where a step ports markup. Source of truth for visuals is `Desktop Main v2.dc.html` (Claude Design project `b2cd8e93-a810-4a2e-be9e-864e71d42220`); the spec is `docs/superpowers/specs/2026-06-25-desktop-main-v2-design.md`.
- Branch `feat/desktop-main-v2` is already checked out.

---

## File Structure

Design system (create):

- `packages/design-system/src/components/forms/segmented-control.tsx` (+ `.css`)
- `packages/design-system/src/components/data-display/terminal-preview.tsx` (+ `.css`)
- `packages/design-system/src/components/pet-showcase/pet-showcase-card.tsx` (+ `.css`)
- Modify: `packages/design-system/src/index.ts` (export the three)

Desktop app (create):

- `apps/desktop/src/app-state/pet-card-status.ts` — `petStatusFromSnapshot` + `PetCardStatus`
- `apps/desktop/src/app/pet-presentation.ts` — `personalityRoleLabel`
- `apps/desktop/src/app/main-window/pet-portrait.tsx` — sprite portrait for cards/edit
- `apps/desktop/src/app/main-window/main-window.tsx` — Tabs shell + section routing
- `apps/desktop/src/app/main-window/home-section.tsx`
- `apps/desktop/src/app/main-window/pet-edit-section.tsx`
- `apps/desktop/src/app/main-window/settings-section.tsx`
- `apps/desktop/src/app/main-window/debug-section.tsx`
- `apps/desktop/src/app/main-window/main-window-icons.tsx` — shared inline SVG icons
- `apps/desktop/src/app/main-window/main-window.css` — page-level layout (dots bg, header, fan)

Desktop app (modify):

- `apps/desktop/src/app-state/pets-driven-state.ts` — add `memo` to `PetRecord`, default in parse
- `apps/desktop/src/app/pets-driven-app.tsx` — render `<MainWindow/>` for home/settings/debug; add live status state; add edit/deploy/recall/memo/name/folder actions
- Test files mirror sources under `apps/desktop/tests/...`

---

## Task 1: Add `memo` field to `PetRecord`

**Files:**

- Modify: `apps/desktop/src/app-state/pets-driven-state.ts`
- Test: `apps/desktop/tests/app-state/pets-driven-state-migration.test.ts`

**Interfaces:**

- Produces: `PetRecord.memo?: string`; `parsePetsDrivenState` returns records where `memo` is a string (defaults to `""`).

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/tests/app-state/pets-driven-state-migration.test.ts`:

```ts
it("defaults memo to an empty string when missing", () => {
  const state = parsePetsDrivenState({
    schemaVersion: 2,
    registeredWorkingDirectories: [],
    pets: [
      {
        id: "pet-1",
        workingDirectoryId: null,
        assetId: "patamon",
        profileId: "profile-1",
        name: "Otto",
        adoptedAt: 1,
        archived: false,
        visible: true,
      },
    ],
    petProfiles: [],
  });

  expect(state.pets[0].memo).toBe("");
});

it("preserves an existing memo", () => {
  const state = parsePetsDrivenState({
    schemaVersion: 2,
    registeredWorkingDirectories: [],
    pets: [
      {
        id: "pet-1",
        workingDirectoryId: null,
        assetId: "patamon",
        profileId: "profile-1",
        name: "Otto",
        adoptedAt: 1,
        archived: false,
        visible: true,
        memo: "watch the auth flow",
      },
    ],
    petProfiles: [],
  });

  expect(state.pets[0].memo).toBe("watch the auth flow");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- pets-driven-state-migration`
Expected: FAIL — the two new assertions get `undefined` for `memo`.

- [ ] **Step 3: Implement the field and default**

In `apps/desktop/src/app-state/pets-driven-state.ts`, add `memo` to `PetRecord`:

```ts
export type PetRecord = {
  id: string;
  /** Back-pointer to the linked working directory; null until an agent is connected. */
  workingDirectoryId: string | null;
  assetId: string;
  profileId: string;
  /** User-given pet name from onboarding. */
  name: string;
  /** Adoption time in epoch ms; 0 for records migrated from v1. */
  adoptedAt: number;
  archived: boolean;
  visible: boolean;
  scale?: number;
  /** Free-form user note shown in the pet-edit screen. */
  memo?: string;
};
```

Then normalize `memo` in `repairPetDirectoryLinks` (it already maps every pet, so it is the single normalization point for both v1 and v2 paths). Replace its `pets` mapping body so the returned record always carries a string `memo`:

```ts
return {
  ...state,
  pets: state.pets.map((pet) => {
    const linkedDirectory = state.registeredWorkingDirectories.find(
      (workingDirectory) => workingDirectory.petId === pet.id,
    );
    const workingDirectoryId = linkedDirectory ? linkedDirectory.id : null;
    const memo = typeof pet.memo === "string" ? pet.memo : "";

    return pet.workingDirectoryId === workingDirectoryId && pet.memo === memo
      ? pet
      : { ...pet, workingDirectoryId, memo };
  }),
};
```

Note: `repairPetDirectoryLinks` early-returns when `state.pets.length === 0`; that path is unaffected (no pets to normalize).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter pets-driven test -- pets-driven-state-migration`
Expected: PASS (all assertions, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app-state/pets-driven-state.ts apps/desktop/tests/app-state/pets-driven-state-migration.test.ts
git add apps/desktop/src/app-state/pets-driven-state.ts apps/desktop/tests/app-state/pets-driven-state-migration.test.ts
git commit -m "[기타] Add memo field to pet records

- Add optional memo string to PetRecord
- Default memo to empty string when parsing state"
```

---

## Task 2: `petStatusFromSnapshot` helper

**Files:**

- Create: `apps/desktop/src/app-state/pet-card-status.ts`
- Test: `apps/desktop/tests/app-state/pet-card-status.test.ts`

**Interfaces:**

- Consumes: `PetSnapshot` from `@pets-driven/pet-engine/core/world-snapshot`; `BadgeTone` from `@pets-driven/design-system`.
- Produces:
  - `type PetCardStatus = { label: string; tone: BadgeTone; dotColor: string }`
  - `function petStatusFromSnapshot(snapshot: PetSnapshot | undefined): PetCardStatus`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/app-state/pet-card-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { petStatusFromSnapshot } from "@/app-state/pet-card-status";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

function snapshot(overrides: Partial<PetSnapshot>): PetSnapshot {
  return {
    id: "pet-1",
    sourceId: "agent-1",
    name: "Otto",
    intent: "wander",
    locomotion: "idle",
    speech: null,
    position: { x: 0, y: 0 },
    contact: { grounded: true, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    ...overrides,
  };
}

describe("petStatusFromSnapshot", () => {
  it("returns Idle/neutral when the pet is not in the live world", () => {
    expect(petStatusFromSnapshot(undefined)).toEqual({
      label: "Idle",
      tone: "neutral",
      dotColor: "var(--ink-300)",
    });
  });

  it("maps a waiting agent state to Needs you/warning", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({
          heldAgentState: { kind: "waiting", label: "WAIT" },
        }),
      ),
    ).toEqual({
      label: "Needs you",
      tone: "warning",
      dotColor: "var(--butter-300)",
    });
  });

  it("maps a failed agent state to Needs you/danger", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({ heldAgentState: { kind: "failed", label: "FAIL" } }),
      ),
    ).toEqual({
      label: "Needs you",
      tone: "danger",
      dotColor: "var(--coral-400)",
    });
  });

  it("maps a completed agent state to Done/success", () => {
    expect(
      petStatusFromSnapshot(
        snapshot({ heldAgentState: { kind: "completed", label: "DONE" } }),
      ),
    ).toEqual({
      label: "Done",
      tone: "success",
      dotColor: "var(--mint-300)",
    });
  });

  it("falls back to Working/info for an in-world pet with no held state", () => {
    expect(petStatusFromSnapshot(snapshot({}))).toEqual({
      label: "Working",
      tone: "info",
      dotColor: "var(--sky-300)",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- pet-card-status`
Expected: FAIL — module `@/app-state/pet-card-status` not found.

- [ ] **Step 3: Implement the helper**

Create `apps/desktop/src/app-state/pet-card-status.ts`:

```ts
import type { BadgeTone } from "@pets-driven/design-system";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

/** Status pill shown on a pet card: a label, a Badge tone, and a dot color. */
export type PetCardStatus = {
  label: string;
  tone: BadgeTone;
  dotColor: string;
};

const IDLE: PetCardStatus = {
  label: "Idle",
  tone: "neutral",
  dotColor: "var(--ink-300)",
};

const WORKING: PetCardStatus = {
  label: "Working",
  tone: "info",
  dotColor: "var(--sky-300)",
};

/**
 * Derive a card status from the live world snapshot. A pet with no snapshot
 * (not deployed, or no running simulation) reads as Idle. The agent hook's
 * held state — the same signal the pet window surfaces — wins when present;
 * otherwise an in-world pet reads as Working.
 */
export function petStatusFromSnapshot(
  snapshot: PetSnapshot | undefined,
): PetCardStatus {
  if (!snapshot) {
    return IDLE;
  }

  switch (snapshot.heldAgentState?.kind) {
    case "waiting":
      return {
        label: "Needs you",
        tone: "warning",
        dotColor: "var(--butter-300)",
      };
    case "failed":
      return {
        label: "Needs you",
        tone: "danger",
        dotColor: "var(--coral-400)",
      };
    case "completed":
      return { label: "Done", tone: "success", dotColor: "var(--mint-300)" };
    default:
      return WORKING;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- pet-card-status`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app-state/pet-card-status.ts apps/desktop/tests/app-state/pet-card-status.test.ts
git add apps/desktop/src/app-state/pet-card-status.ts apps/desktop/tests/app-state/pet-card-status.test.ts
git commit -m "[기타] Derive pet card status from world snapshot

- Add petStatusFromSnapshot mapping held agent state to a status pill
- Default to Idle when a pet is absent from the live world"
```

---

## Task 3: `personalityRoleLabel` helper

**Files:**

- Create: `apps/desktop/src/app/pet-presentation.ts`
- Test: `apps/desktop/tests/app/pet-presentation.test.ts`

**Interfaces:**

- Consumes: `PERSONALITY_OPTIONS` from `@/app/onboarding/personality-options`; `PetPersonalityId` from `@pets-driven/pet-engine/pets/profiles/pet-profile`.
- Produces: `function personalityRoleLabel(personalityId: PetPersonalityId | undefined): string`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/app/pet-presentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { personalityRoleLabel } from "@/app/pet-presentation";

describe("personalityRoleLabel", () => {
  it("returns the personality title", () => {
    expect(personalityRoleLabel("playful")).toBe("Playful");
    expect(personalityRoleLabel("steady")).toBe("Steady");
  });

  it("falls back to Pet for an unknown or missing personality", () => {
    expect(personalityRoleLabel(undefined)).toBe("Pet");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- pet-presentation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/desktop/src/app/pet-presentation.ts`:

```ts
import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
import type { PetPersonalityId } from "@pets-driven/pet-engine/pets/profiles/pet-profile";

/** Human-readable role label for a pet, derived from its personality preset. */
export function personalityRoleLabel(
  personalityId: PetPersonalityId | undefined,
): string {
  const option = PERSONALITY_OPTIONS.find(
    (candidate) => candidate.id === personalityId,
  );

  return option ? option.title : "Pet";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- pet-presentation`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app/pet-presentation.ts apps/desktop/tests/app/pet-presentation.test.ts
git add apps/desktop/src/app/pet-presentation.ts apps/desktop/tests/app/pet-presentation.test.ts
git commit -m "[기타] Map pet personality to a role label

- Add personalityRoleLabel resolving personality presets to titles"
```

---

## Task 4: `SegmentedControl` design-system component

**Files:**

- Create: `packages/design-system/src/components/forms/segmented-control.tsx`
- Create: `packages/design-system/src/components/forms/segmented-control.css`
- Modify: `packages/design-system/src/index.ts`

**Interfaces:**

- Produces:
  - `type SegmentedOption = { value: string; label: ReactNode }`
  - `interface SegmentedControlProps` with `options: SegmentedOption[]`, `value: string`, `onChange: (value: string) => void`, optional `className`.
  - `function SegmentedControl(props: SegmentedControlProps): JSX.Element`

- [ ] **Step 1: Write the component**

Create `packages/design-system/src/components/forms/segmented-control.tsx`:

```tsx
import type { ReactNode } from "react";
import "./segmented-control.css";

export type SegmentedOption = {
  value: string;
  label: ReactNode;
};

/**
 * A compact segmented toggle: a sunken track holding one raised, selected
 * segment. Controlled via `value` + `onChange`.
 */
export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps) {
  return (
    <div
      className={["pd-segmented", className].filter(Boolean).join(" ")}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            aria-selected={active}
            className={[
              "pd-segmented__item",
              active ? "pd-segmented__item--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write the CSS**

Create `packages/design-system/src/components/forms/segmented-control.css`:

```css
.pd-segmented {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--surface-sunken);
  border: 1px solid var(--border-soft);
  border-radius: 12px;
}

.pd-segmented__item {
  border: 0;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 9px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  background: transparent;
  color: var(--text-muted);
  transition:
    background 140ms ease,
    color 140ms ease;
}

.pd-segmented__item--active {
  background: var(--surface-card);
  color: var(--text-strong);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 3: Export from the index**

In `packages/design-system/src/index.ts`, add after the `Switch` export:

```ts
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./components/forms/segmented-control";
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @pets-driven/design-system typecheck`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/design-system/src/components/forms/segmented-control.tsx packages/design-system/src/components/forms/segmented-control.css packages/design-system/src/index.ts
git add packages/design-system/src/components/forms/segmented-control.tsx packages/design-system/src/components/forms/segmented-control.css packages/design-system/src/index.ts
git commit -m "[기타] Add SegmentedControl to design system

- Add controlled segmented toggle with sunken track and raised active segment"
```

---

## Task 5: `TerminalPreview` design-system component

**Files:**

- Create: `packages/design-system/src/components/data-display/terminal-preview.tsx`
- Create: `packages/design-system/src/components/data-display/terminal-preview.css`
- Modify: `packages/design-system/src/index.ts`

**Interfaces:**

- Produces:
  - `interface TerminalPreviewProps { cwd: string; prompt: string; command: string; className?: string }`
  - `function TerminalPreview(props: TerminalPreviewProps): JSX.Element`

- [ ] **Step 1: Write the component**

Create `packages/design-system/src/components/data-display/terminal-preview.tsx`:

```tsx
import "./terminal-preview.css";

/**
 * The "soft terminal" preview block: a muted working-directory line above a
 * prompt + command line. Presentational; callers resolve the strings.
 */
export interface TerminalPreviewProps {
  cwd: string;
  prompt: string;
  command: string;
  className?: string;
}

export function TerminalPreview({
  cwd,
  prompt,
  command,
  className = "",
}: TerminalPreviewProps) {
  return (
    <div className={["pd-terminal", className].filter(Boolean).join(" ")}>
      <div className="pd-terminal__cwd">{cwd}</div>
      <div>
        <span className="pd-terminal__prompt">{prompt}</span>{" "}
        <span className="pd-terminal__command">{command}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the CSS**

Create `packages/design-system/src/components/data-display/terminal-preview.css`:

```css
.pd-terminal {
  background: var(--term-bg);
  border-radius: 12px;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
}

.pd-terminal__cwd {
  color: var(--term-muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.pd-terminal__prompt {
  color: var(--term-prompt);
}

.pd-terminal__command {
  color: var(--term-fg);
}
```

- [ ] **Step 3: Export from the index**

In `packages/design-system/src/index.ts`, add after the `Tag` export:

```ts
export {
  TerminalPreview,
  type TerminalPreviewProps,
} from "./components/data-display/terminal-preview";
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @pets-driven/design-system typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/design-system/src/components/data-display/terminal-preview.tsx packages/design-system/src/components/data-display/terminal-preview.css packages/design-system/src/index.ts
git add packages/design-system/src/components/data-display/terminal-preview.tsx packages/design-system/src/components/data-display/terminal-preview.css packages/design-system/src/index.ts
git commit -m "[기타] Add TerminalPreview to design system

- Add soft-terminal preview block rendering cwd, prompt, and command"
```

---

## Task 6: `PetShowcaseCard` design-system component

**Files:**

- Create: `packages/design-system/src/components/pet-showcase/pet-showcase-card.tsx`
- Create: `packages/design-system/src/components/pet-showcase/pet-showcase-card.css`
- Modify: `packages/design-system/src/index.ts`

**Interfaces:**

- Consumes: `BadgeTone` (only for the caller's status type; the card takes the resolved fields directly).
- Produces:
  - `interface PetShowcaseCardStatus { label: string; dotColor: string }`
  - `interface PetShowcaseCardProps { role: string; name: string; status: PetShowcaseCardStatus; gradient: { from: string; to: string }; portrait: ReactNode; featured?: boolean; onEdit?: () => void; className?: string }`
  - `function PetShowcaseCard(props: PetShowcaseCardProps): JSX.Element`

Notes: the card renders the gradient body, decorative wave, scrim, role/name, the portrait slot, an edit button, and the status pill. It is art-agnostic — the portrait is passed in. Positioning/animation (the fan transform) is the caller's responsibility via a wrapping element; the card only reacts to `featured` (the hover/featured ring). The decorative wave uses an inline SVG data URI identical to the source design's `.pdwave`.

- [ ] **Step 1: Write the component**

Create `packages/design-system/src/components/pet-showcase/pet-showcase-card.tsx`:

```tsx
import type { ReactNode } from "react";
import "./pet-showcase-card.css";

export interface PetShowcaseCardStatus {
  label: string;
  dotColor: string;
}

/**
 * A pet "trading card": a soft gradient body with a role label, name, a
 * portrait slot, and a status pill. Art-agnostic — the portrait is passed in.
 * The caller owns fan positioning; the card only renders the featured ring.
 */
export interface PetShowcaseCardProps {
  role: string;
  name: string;
  status: PetShowcaseCardStatus;
  /** Gradient stops for the card body. */
  gradient: { from: string; to: string };
  portrait: ReactNode;
  featured?: boolean;
  onEdit?: () => void;
  className?: string;
}

export function PetShowcaseCard({
  role,
  name,
  status,
  gradient,
  portrait,
  featured = false,
  onEdit,
  className = "",
}: PetShowcaseCardProps) {
  return (
    <div
      className={[
        "pd-pet-card",
        featured ? "pd-pet-card--featured" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: `linear-gradient(160deg, ${gradient.from}, ${gradient.to})`,
      }}
    >
      <span aria-hidden="true" className="pd-pet-card__wave" />
      <span aria-hidden="true" className="pd-pet-card__scrim" />

      {onEdit ? (
        <button
          aria-label="Edit pet"
          className="pd-pet-card__edit"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      ) : null}

      <div className="pd-pet-card__head">
        <div className="pd-pet-card__role">{role}</div>
        <div className="pd-pet-card__name">{name}</div>
      </div>

      <div className="pd-pet-card__portrait">
        {portrait}
        <div className="pd-pet-card__status">
          <span
            className="pd-pet-card__status-dot"
            style={{ background: status.dotColor }}
          />
          <span className="pd-pet-card__status-label">{status.label}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the CSS**

Create `packages/design-system/src/components/pet-showcase/pet-showcase-card.css`. The `__wave` background is the source design's `.pdwave` data URI, verbatim:

```css
.pd-pet-card {
  position: relative;
  overflow: hidden;
  border-radius: 30px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 26px 50px -26px rgba(70, 55, 120, 0.5);
}

.pd-pet-card--featured {
  border: 2px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 40px 70px -24px rgba(70, 55, 120, 0.55),
    0 0 0 7px rgba(255, 255, 255, 0.5);
}

.pd-pet-card__wave {
  position: absolute;
  inset: 0;
  opacity: 0.16;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='130'%3E%3Cg fill='none' stroke='%23fff' stroke-width='2.4'%3E%3Cpath d='M-12 22 Q35 4 72 22 T160 22'/%3E%3Cpath d='M-12 54 Q35 36 72 54 T160 54'/%3E%3Cpath d='M-12 86 Q35 68 72 86 T160 86'/%3E%3Cpath d='M-12 118 Q35 100 72 118 T160 118'/%3E%3C/g%3E%3C/svg%3E");
  background-size: 150px 130px;
}

.pd-pet-card__scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.22),
    transparent 26%,
    transparent 64%,
    rgba(0, 0, 0, 0.28)
  );
}

.pd-pet-card__edit {
  position: absolute;
  top: 13px;
  right: 13px;
  z-index: 5;
  width: 27px;
  height: 27px;
  border-radius: 999px;
  border: 0;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pd-pet-card__edit:hover {
  background: rgba(0, 0, 0, 0.5);
}

.pd-pet-card__head {
  position: relative;
  z-index: 2;
  padding: 4px 6px 12px;
}

.pd-pet-card__role {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.82);
}

.pd-pet-card__name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 27px;
  line-height: 1;
  color: #fff;
  margin-top: 2px;
}

.pd-pet-card__portrait {
  position: relative;
  z-index: 2;
}

.pd-pet-card__status {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(5px);
  padding: 5px 12px 5px 10px;
  border-radius: 999px;
}

.pd-pet-card__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex: none;
}

.pd-pet-card__status-label {
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.01em;
}
```

- [ ] **Step 3: Export from the index**

In `packages/design-system/src/index.ts`, add at the end of the data-display group:

```ts
export {
  PetShowcaseCard,
  type PetShowcaseCardProps,
  type PetShowcaseCardStatus,
} from "./components/pet-showcase/pet-showcase-card";
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @pets-driven/design-system typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/design-system/src/components/pet-showcase/pet-showcase-card.tsx packages/design-system/src/components/pet-showcase/pet-showcase-card.css packages/design-system/src/index.ts
git add packages/design-system/src/components/pet-showcase/pet-showcase-card.tsx packages/design-system/src/components/pet-showcase/pet-showcase-card.css packages/design-system/src/index.ts
git commit -m "[기타] Add PetShowcaseCard to design system

- Add art-agnostic gradient pet card with role, name, portrait slot, and status pill"
```

---

## Task 7: `PetPortrait` (app sprite portrait)

**Files:**

- Create: `apps/desktop/src/app/main-window/pet-portrait.tsx`

**Interfaces:**

- Consumes: `usePetSpritesheetUrl` from `@/app/onboarding/use-pet-spritesheet-url`; `PetSprite` from `@pets-driven/pet-engine/pets/rendering/pet-sprite`; `PET_CELL_SIZE` from `@pets-driven/pet-engine/pets/assets/pet-atlas`.
- Produces: `function PetPortrait(props: { assetId: string; name: string; width?: number; height?: number }): JSX.Element`

This task has no separate unit test (it is a thin sprite wrapper); it is exercised by the home/edit smoke tests in later tasks and by typecheck.

- [ ] **Step 1: Write the component**

Create `apps/desktop/src/app/main-window/pet-portrait.tsx`:

```tsx
import { PET_CELL_SIZE } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { usePetSpritesheetUrl } from "@/app/onboarding/use-pet-spritesheet-url";

type PetPortraitProps = {
  assetId: string;
  name: string;
  width?: number;
  height?: number;
};

/**
 * A static idle-frame portrait of a pet, sized to fill a showcase card's art
 * slot. Renders the real spritesheet so the home mirrors the desktop pet.
 */
export function PetPortrait({
  assetId,
  name,
  width = 192,
  height = 208,
}: PetPortraitProps) {
  const spritesheetUrl = usePetSpritesheetUrl(assetId);
  const scale = width / PET_CELL_SIZE.width;

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <PetSprite
        alt={`${name} portrait`}
        elapsedMs={0}
        imageUrl={spritesheetUrl}
        intent={{ kind: "idle", facing: "right" }}
        scale={scale}
        size={PET_CELL_SIZE}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter pets-driven typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/pet-portrait.tsx
git add apps/desktop/src/app/main-window/pet-portrait.tsx
git commit -m "[기타] Add pet sprite portrait for the showcase

- Render a static idle-frame sprite sized to a card art slot"
```

---

## Task 8: Shared icons + page CSS

**Files:**

- Create: `apps/desktop/src/app/main-window/main-window-icons.tsx`
- Create: `apps/desktop/src/app/main-window/main-window.css`

**Interfaces:**

- Produces: `HomeIcon`, `GearIcon`, `WrenchIcon`, `PlusIcon`, `BackIcon`, `FolderIcon`, `TrashIcon` — each `function (): JSX.Element` returning an inline SVG. CSS classes: `pd-main`, `pd-main__dots`, `pd-main__header`, `pd-main__nav`, `pd-main__body`, `pd-home`, `pd-home__fan`, `pd-home__fan-card`, `pd-toast`.

- [ ] **Step 1: Write the icons**

Create `apps/desktop/src/app/main-window/main-window-icons.tsx`. Each icon mirrors the source design's SVG paths:

```tsx
type IconProps = { size?: number };

function Icon({
  size = 17,
  strokeWidth = 2,
  children,
}: {
  size?: number;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ size }: IconProps) {
  return (
    <Icon size={size}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Icon>
  );
}

export function GearIcon({ size }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </Icon>
  );
}

export function WrenchIcon({ size }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Icon>
  );
}

export function PlusIcon({ size }: IconProps) {
  return (
    <Icon size={size} strokeWidth={2.8}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Icon>
  );
}

export function BackIcon({ size }: IconProps) {
  return (
    <Icon size={size} strokeWidth={2.4}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function FolderIcon({ size }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Icon>
  );
}

export function TrashIcon({ size }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </Icon>
  );
}
```

- [ ] **Step 2: Write the page CSS**

Create `apps/desktop/src/app/main-window/main-window.css`:

```css
.pd-main {
  position: relative;
  min-height: 100vh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--surface-app);
  font-family: var(--font-body);
  color: var(--text-body);
}

.pd-main__dots {
  background-image: radial-gradient(var(--ink-200) 1.4px, transparent 1.4px);
  background-size: 22px 22px;
}

.pd-main__header {
  position: relative;
  z-index: 30;
  flex: none;
  height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  border-bottom: 1px solid var(--border-soft);
  background: rgba(255, 252, 253, 0.7);
  backdrop-filter: blur(8px);
}

.pd-main__body {
  position: relative;
  z-index: 6;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.pd-home {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pd-home__fan {
  position: relative;
  flex: none;
  height: 300px;
  z-index: 4;
}

.pd-home__fan-card {
  position: absolute;
  bottom: -74px;
  width: 224px;
  transform-origin: bottom center;
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  cursor: pointer;
}

.pd-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-card);
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  padding: 11px 20px;
  box-shadow: var(--shadow-xl);
}

.pd-toast__label {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-strong);
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter pets-driven typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/main-window-icons.tsx apps/desktop/src/app/main-window/main-window.css
git add apps/desktop/src/app/main-window/main-window-icons.tsx apps/desktop/src/app/main-window/main-window.css
git commit -m "[기타] Add main window icons and page layout styles"
```

---

## Task 9: Home section

**Files:**

- Create: `apps/desktop/src/app/main-window/home-section.tsx`
- Test: `apps/desktop/tests/app/home-section.test.tsx`

**Interfaces:**

- Consumes: `PetShowcaseCard` (DS); `PetPortrait` (Task 7); `PlusIcon` (Task 8); `Button` (DS); `personalityRoleLabel` (Task 3); `PetCardStatus` (Task 2).
- Produces:
  - `type HomePetView = { id: string; name: string; assetId: string; role: string; status: PetCardStatus; gradient: { from: string; to: string } }`
  - `interface HomeSectionProps { atHome: HomePetView[]; inField: { id: string; name: string; color: string }[]; onDeploy: (petId: string) => void; onRecall: (petId: string) => void; onEdit: (petId: string) => void; onAddPet: () => void; onShowAll: () => void; onHideAll: () => void }`
  - `function HomeSection(props: HomeSectionProps): JSX.Element`

Design notes: the section computes fan geometry exactly as the source `renderVals` does. `atHome` is the showcase roster (pets with `visible === false`); `inField` is deployed pets (`visible === true`). Clicking a card calls `onDeploy`; clicking a field chip calls `onRecall`. Gradient stops come from the caller (Task 12 derives them per personality).

- [ ] **Step 1: Write the failing smoke test**

Create `apps/desktop/tests/app/home-section.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeSection } from "@/app/main-window/home-section";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "patamon",
  role: "Steady",
  status: {
    label: "Idle",
    tone: "neutral" as const,
    dotColor: "var(--ink-300)",
  },
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
};

describe("HomeSection", () => {
  it("renders the greeting and a card per at-home pet", () => {
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={vi.fn()}
        onRecall={vi.fn()}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Otto")).toBeInTheDocument();
    expect(screen.getByText("Steady")).toBeInTheDocument();
  });

  it("deploys a pet when its card is clicked", () => {
    const onDeploy = vi.fn();
    render(
      <HomeSection
        atHome={[pet]}
        inField={[]}
        onDeploy={onDeploy}
        onRecall={vi.fn()}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Otto"));
    expect(onDeploy).toHaveBeenCalledWith("otto");
  });

  it("recalls a pet when its field chip is clicked", () => {
    const onRecall = vi.fn();
    render(
      <HomeSection
        atHome={[]}
        inField={[{ id: "mochi", name: "Mochi", color: "#FF6FAB" }]}
        onDeploy={vi.fn()}
        onRecall={onRecall}
        onEdit={vi.fn()}
        onAddPet={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Mochi"));
    expect(onRecall).toHaveBeenCalledWith("mochi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- home-section`
Expected: FAIL — module `@/app/main-window/home-section` not found.

- [ ] **Step 3: Implement the section**

Create `apps/desktop/src/app/main-window/home-section.tsx`:

```tsx
import { useState, type CSSProperties } from "react";
import { Button, PetShowcaseCard } from "@pets-driven/design-system";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import { PlusIcon } from "@/app/main-window/main-window-icons";

export type HomePetView = {
  id: string;
  name: string;
  assetId: string;
  role: string;
  status: PetCardStatus;
  gradient: { from: string; to: string };
};

export interface HomeSectionProps {
  atHome: HomePetView[];
  inField: { id: string; name: string; color: string }[];
  onDeploy: (petId: string) => void;
  onRecall: (petId: string) => void;
  onEdit: (petId: string) => void;
  onAddPet: () => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

/** Order the fan so the centre pet sits in the middle, others fan outward. */
function fanOrder<T>(pets: T[]): { pet: T; index: number; center: number }[] {
  if (pets.length === 0) {
    return [];
  }

  const centerSource = Math.floor(pets.length / 2);
  const ordered: T[] = [pets[centerSource]];
  const others = pets.filter((_, i) => i !== centerSource);

  for (let k = 0; k < others.length; k++) {
    if (k % 2 === 0) {
      ordered.push(others[k]);
    } else {
      ordered.unshift(others[k]);
    }
  }

  const center = ordered.indexOf(pets[centerSource]);

  return ordered.map((pet, index) => ({ pet, index, center }));
}

export function HomeSection({
  atHome,
  inField,
  onDeploy,
  onRecall,
  onEdit,
  onAddPet,
  onShowAll,
  onHideAll,
}: HomeSectionProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const n = atHome.length;
  const stepX = n <= 5 ? 150 : n <= 7 ? 124 : n <= 9 ? 104 : 88;
  const rotX = n <= 6 ? 7 : n <= 9 ? 5.5 : 4.5;
  const ordered = fanOrder(atHome);

  return (
    <div className="pd-home">
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "-160px",
          transform: "translateX(-50%)",
          width: "1100px",
          height: "620px",
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(249,94,158,0.10), rgba(139,127,232,0.07) 45%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "26px",
          zIndex: 9,
          display: "flex",
          alignItems: "center",
          gap: "9px",
        }}
      >
        <span
          style={{
            whiteSpace: "nowrap",
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--text-subtle)",
            marginRight: "2px",
          }}
        >
          {inField.length} on the desktop
        </span>
        <Button onClick={onShowAll} size="sm" variant="neutral">
          Show all
        </Button>
        <Button onClick={onHideAll} size="sm" variant="neutral">
          Hide all
        </Button>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 6,
          flex: 1,
          minHeight: 0,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--blossom-600)",
            marginBottom: "20px",
          }}
        >
          Your pack
        </span>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "44px",
            lineHeight: 1.1,
            color: "var(--text-strong)",
            margin: "0 0 28px",
            letterSpacing: "-0.015em",
          }}
        >
          Good morning,
          <br />
          Trainer!
        </h2>
        <Button iconLeft={<PlusIcon />} onClick={onAddPet} size="lg">
          Add a pet
        </Button>
        <span
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            marginTop: "13px",
          }}
        >
          Bring a new pet into the pack and give it a job.
        </span>

        {inField.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: "14px",
              maxWidth: "680px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-subtle)",
              }}
            >
              In the field
            </span>
            {inField.map((pet) => (
              <button
                key={pet.id}
                onClick={() => onRecall(pet.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  border: "1px solid var(--border-soft)",
                  background: "var(--surface-card)",
                  borderRadius: "999px",
                  padding: "5px 12px 5px 7px",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                }}
                type="button"
              >
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    flex: "none",
                    background: pet.color,
                  }}
                />
                <span
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "var(--text-body)",
                  }}
                >
                  {pet.name}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="pd-home__fan">
        {ordered.map(({ pet, index, center }) => {
          const d = index - center;
          const ty = Math.abs(d) * 22;
          const hovered = hoverId === pet.id;
          const wrapStyle: CSSProperties = {
            left: `calc(50% + ${d * stepX}px)`,
            transform: hovered
              ? `translateX(-50%) translateY(${ty - 46}px) rotate(${d * 2}deg) scale(1.1)`
              : `translateX(-50%) translateY(${ty}px) rotate(${d * rotX}deg)`,
            zIndex: hovered ? 200 : 60 - Math.round(Math.abs(d) * 6),
          };

          return (
            <div
              className="pd-home__fan-card"
              key={pet.id}
              onClick={() => onDeploy(pet.id)}
              onMouseEnter={() => setHoverId(pet.id)}
              onMouseLeave={() =>
                setHoverId((current) => (current === pet.id ? null : current))
              }
              style={wrapStyle}
            >
              <PetShowcaseCard
                featured={hovered}
                gradient={pet.gradient}
                name={pet.name}
                onEdit={() => onEdit(pet.id)}
                portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
                role={pet.role}
                status={{
                  label: pet.status.label,
                  dotColor: pet.status.dotColor,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- home-section`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/home-section.tsx apps/desktop/tests/app/home-section.test.tsx
git add apps/desktop/src/app/main-window/home-section.tsx apps/desktop/tests/app/home-section.test.tsx
git commit -m "[기타] Add home showcase section

- Render the fanned pet showcase with deploy-on-click and field-chip recall
- Compute adaptive fan geometry from the at-home roster"
```

---

## Task 10: Pet edit section

**Files:**

- Create: `apps/desktop/src/app/main-window/pet-edit-section.tsx`
- Test: `apps/desktop/tests/app/pet-edit-section.test.tsx`

**Interfaces:**

- Consumes: `Button`, `Switch`, `PetShowcaseCard` (DS); `PetPortrait`; `BackIcon`, `FolderIcon`, `TrashIcon` (Task 8); `PetCardStatus`.
- Produces:
  - `interface PetEditView { id: string; name: string; assetId: string; role: string; status: PetCardStatus; gradient: { from: string; to: string }; folder: string; memo: string; deployed: boolean }`
  - `interface PetEditSectionProps { pet: PetEditView; onName: (value: string) => void; onMemo: (value: string) => void; onPickFolder: () => void; onToggleDeployed: () => void; onDelete: () => void; onDone: () => void }`
  - `function PetEditSection(props: PetEditSectionProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/app/pet-edit-section.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PetEditSection } from "@/app/main-window/pet-edit-section";

const pet = {
  id: "otto",
  name: "Otto",
  assetId: "patamon",
  role: "Steady",
  status: {
    label: "Idle",
    tone: "neutral" as const,
    dotColor: "var(--ink-300)",
  },
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
  folder: "core",
  memo: "",
  deployed: false,
};

function setup(overrides = {}) {
  const props = {
    pet,
    onName: vi.fn(),
    onMemo: vi.fn(),
    onPickFolder: vi.fn(),
    onToggleDeployed: vi.fn(),
    onDelete: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<PetEditSection {...props} />);
  return props;
}

describe("PetEditSection", () => {
  it("edits the name", () => {
    const onName = vi.fn();
    setup({ onName });
    fireEvent.change(screen.getByDisplayValue("Otto"), {
      target: { value: "Ottoman" },
    });
    expect(onName).toHaveBeenCalledWith("Ottoman");
  });

  it("edits the memo", () => {
    const onMemo = vi.fn();
    setup({ onMemo });
    fireEvent.change(
      screen.getByPlaceholderText("Add a note about this pet…"),
      {
        target: { value: "watch auth" },
      },
    );
    expect(onMemo).toHaveBeenCalledWith("watch auth");
  });

  it("returns home via Done", () => {
    const onDone = vi.fn();
    setup({ onDone });
    fireEvent.click(screen.getByText("Done"));
    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- pet-edit-section`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the section**

Create `apps/desktop/src/app/main-window/pet-edit-section.tsx`:

```tsx
import { Button, PetShowcaseCard, Switch } from "@pets-driven/design-system";
import type { PetCardStatus } from "@/app-state/pet-card-status";
import { PetPortrait } from "@/app/main-window/pet-portrait";
import {
  BackIcon,
  FolderIcon,
  TrashIcon,
} from "@/app/main-window/main-window-icons";

export interface PetEditView {
  id: string;
  name: string;
  assetId: string;
  role: string;
  status: PetCardStatus;
  gradient: { from: string; to: string };
  folder: string;
  memo: string;
  deployed: boolean;
}

export interface PetEditSectionProps {
  pet: PetEditView;
  onName: (value: string) => void;
  onMemo: (value: string) => void;
  onPickFolder: () => void;
  onToggleDeployed: () => void;
  onDelete: () => void;
  onDone: () => void;
}

const fieldLabelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-subtle)",
  marginBottom: "7px",
};

const textControlStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1.5px solid var(--border-default)",
  background: "var(--surface-card)",
  borderRadius: "14px",
  padding: "12px 14px",
  color: "var(--text-strong)",
  outline: "none",
  boxShadow: "var(--shadow-inset)",
};

export function PetEditSection({
  pet,
  onName,
  onMemo,
  onPickFolder,
  onToggleDeployed,
  onDelete,
  onDone,
}: PetEditSectionProps) {
  return (
    <div style={{ padding: "26px 24px 48px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <Button
          iconLeft={<BackIcon />}
          onClick={onDone}
          size="sm"
          variant="neutral"
        >
          Back to the pack
        </Button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: "30px",
            marginTop: "20px",
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: "8px",
            }}
          >
            <div style={{ width: "224px" }}>
              <PetShowcaseCard
                featured
                gradient={pet.gradient}
                name={pet.name}
                portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
                role={pet.role}
                status={{
                  label: pet.status.label,
                  dotColor: pet.status.dotColor,
                }}
              />
            </div>
          </div>

          <div
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-soft)",
              borderRadius: "24px",
              boxShadow: "var(--shadow-lg)",
              padding: "26px 26px 24px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-subtle)",
              }}
            >
              Pet details
            </span>

            <label style={{ display: "block", marginTop: "14px" }}>
              <span style={fieldLabelStyle}>Name</span>
              <input
                onChange={(event) => onName(event.target.value)}
                style={{
                  ...textControlStyle,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "20px",
                }}
                value={pet.name}
              />
            </label>

            <label style={{ display: "block", marginTop: "18px" }}>
              <span style={fieldLabelStyle}>Working folder</span>
              <button
                onClick={onPickFolder}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  border: "1.5px solid var(--border-default)",
                  background: "var(--surface-card)",
                  borderRadius: "14px",
                  padding: "11px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                type="button"
              >
                <span
                  style={{
                    color: "var(--text-subtle)",
                    display: "inline-flex",
                    flex: "none",
                  }}
                >
                  <FolderIcon size={16} />
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    color: "var(--text-strong)",
                    flex: 1,
                  }}
                >
                  {pet.folder || "Choose a folder…"}
                </span>
              </button>
            </label>

            <label style={{ display: "block", marginTop: "18px" }}>
              <span style={fieldLabelStyle}>Note</span>
              <textarea
                onChange={(event) => onMemo(event.target.value)}
                placeholder="Add a note about this pet…"
                rows={3}
                style={{
                  ...textControlStyle,
                  fontFamily: "var(--font-body)",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  resize: "none",
                }}
                value={pet.memo}
              />
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginTop: "16px",
                padding: "12px 14px",
                background: "var(--surface-sunken)",
                borderRadius: "14px",
              }}
            >
              <Switch
                checked={pet.deployed}
                onChange={onToggleDeployed}
                size="sm"
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "14px",
                    color: "var(--text-strong)",
                  }}
                >
                  Show on desktop
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Keep this pet out on the desktop as a companion.
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginTop: "22px",
              }}
            >
              <button
                onClick={onDelete}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1.5px solid var(--coral-200)",
                  background: "var(--surface-card)",
                  color: "var(--coral-600)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                  fontSize: "13.5px",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
                type="button"
              >
                <TrashIcon size={16} />
                Delete pet
              </button>
              <Button onClick={onDone} variant="neutral">
                Done
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- pet-edit-section`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/pet-edit-section.tsx apps/desktop/tests/app/pet-edit-section.test.tsx
git add apps/desktop/src/app/main-window/pet-edit-section.tsx apps/desktop/tests/app/pet-edit-section.test.tsx
git commit -m "[기타] Add pet edit section

- Render portrait plus name, folder, note, deploy toggle, and delete controls"
```

---

## Task 11: Settings section

**Files:**

- Create: `apps/desktop/src/app/main-window/settings-section.tsx`
- Test: `apps/desktop/tests/app/settings-section.test.tsx`

**Interfaces:**

- Consumes: `Badge`, `Button`, `Input`, `SegmentedControl`, `Switch`, `TerminalPreview` (DS).
- Produces:
  - `interface SettingsSectionProps { shell: string; command: string; onShell: (value: string) => void; onCommand: (value: string) => void; confirmRun: boolean; onToggleConfirm: () => void; preview: { cwd: string; prompt: string; command: string }; hook: { tone: import("@pets-driven/design-system").BadgeTone; label: string; summary: string; url: string }; onReconnect: () => void }`
  - `function SettingsSection(props: SettingsSectionProps): JSX.Element`

Note: `confirmRun` is local UI state owned by the parent (not yet persisted); wiring it to state is out of scope per the spec, so the parent passes a constant `true` and a no-op toggle this pass. The shell/command/preview/hook are fully wired.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/app/settings-section.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsSection } from "@/app/main-window/settings-section";

function setup(overrides = {}) {
  const props = {
    shell: "bash",
    command: "claude --resume",
    onShell: vi.fn(),
    onCommand: vi.fn(),
    confirmRun: true,
    onToggleConfirm: vi.fn(),
    preview: { cwd: "~/core", prompt: "$", command: "claude --resume" },
    hook: {
      tone: "success" as const,
      label: "All connected",
      summary: "6 of 6 agents reporting",
      url: "claude-hook://127.0.0.1:7878",
    },
    onReconnect: vi.fn(),
    ...overrides,
  };
  render(<SettingsSection {...props} />);
  return props;
}

describe("SettingsSection", () => {
  it("edits the command", () => {
    const onCommand = vi.fn();
    setup({ onCommand });
    fireEvent.change(screen.getByDisplayValue("claude --resume"), {
      target: { value: "claude" },
    });
    expect(onCommand).toHaveBeenCalledWith("claude");
  });

  it("switches the shell", () => {
    const onShell = vi.fn();
    setup({ onShell });
    fireEvent.click(screen.getByText("cmd"));
    expect(onShell).toHaveBeenCalledWith("cmd");
  });

  it("shows the hook status label", () => {
    setup();
    expect(screen.getByText("All connected")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- settings-section`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the section**

Create `apps/desktop/src/app/main-window/settings-section.tsx`:

```tsx
import {
  Badge,
  Button,
  Input,
  SegmentedControl,
  Switch,
  TerminalPreview,
  type BadgeTone,
} from "@pets-driven/design-system";

export interface SettingsSectionProps {
  shell: string;
  command: string;
  onShell: (value: string) => void;
  onCommand: (value: string) => void;
  confirmRun: boolean;
  onToggleConfirm: () => void;
  preview: { cwd: string; prompt: string; command: string };
  hook: { tone: BadgeTone; label: string; summary: string; url: string };
  onReconnect: () => void;
}

const uppercaseLabel = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-subtle)",
  marginBottom: "7px",
};

const cardStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-soft)",
  borderRadius: "22px",
  boxShadow: "var(--shadow-md)",
  padding: "22px 24px",
};

export function SettingsSection({
  shell,
  command,
  onShell,
  onCommand,
  confirmRun,
  onToggleConfirm,
  preview,
  hook,
  onReconnect,
}: SettingsSectionProps) {
  return (
    <div style={{ padding: "38px 24px 64px" }}>
      <div style={{ maxWidth: "840px", margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "24px",
            color: "var(--text-strong)",
            margin: "0 0 18px",
          }}
        >
          Settings
        </h2>

        <div style={{ ...cardStyle, marginBottom: "20px" }}>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "17px",
              color: "var(--text-strong)",
              margin: "0 0 5px",
            }}
          >
            Double-click action
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              margin: "0 0 18px",
              lineHeight: 1.45,
            }}
          >
            When you double-click a pet, it runs this command in its working
            folder.
          </p>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <span style={uppercaseLabel}>Shell</span>
                <SegmentedControl
                  onChange={onShell}
                  options={[
                    { value: "bash", label: "bash" },
                    { value: "cmd", label: "cmd" },
                  ]}
                  value={shell}
                />
              </div>
              <label style={{ flex: 1, minWidth: "240px" }}>
                <span style={uppercaseLabel}>Command</span>
                <Input
                  onChange={(event) => onCommand(event.target.value)}
                  placeholder="claude --resume"
                  value={command}
                />
              </label>
            </div>

            <div>
              <span style={uppercaseLabel}>Runs on double-click</span>
              <TerminalPreview
                command={preview.command}
                cwd={preview.cwd}
                prompt={preview.prompt}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: "var(--surface-sunken)",
                borderRadius: "14px",
              }}
            >
              <Switch
                checked={confirmRun}
                onChange={onToggleConfirm}
                size="sm"
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "14px",
                    color: "var(--text-strong)",
                  }}
                >
                  Ask before running
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Show a confirm dialog the first time each pet runs its
                  command.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            ...cardStyle,
            display: "flex",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "17px",
                  color: "var(--text-strong)",
                  margin: 0,
                }}
              >
                Claude agent hook
              </h3>
              <Badge dot tone={hook.tone}>
                {hook.label}
              </Badge>
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "var(--text-muted)",
                marginTop: "5px",
              }}
            >
              {hook.summary}
            </div>
            <code
              style={{
                display: "inline-block",
                marginTop: "8px",
                fontFamily: "var(--font-mono)",
                fontSize: "12.5px",
                color: "var(--term-pink)",
                background: "var(--term-bg)",
                padding: "5px 10px",
                borderRadius: "9px",
              }}
            >
              {hook.url || "unavailable"}
            </code>
          </div>
          <Button onClick={onReconnect} variant="neutral">
            Reconnect
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- settings-section`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/settings-section.tsx apps/desktop/tests/app/settings-section.test.tsx
git add apps/desktop/src/app/main-window/settings-section.tsx apps/desktop/tests/app/settings-section.test.tsx
git commit -m "[기타] Add settings section

- Wire double-click action to shell, command, and terminal preview
- Surface Claude agent hook status"
```

---

## Task 12: Debug section

**Files:**

- Create: `apps/desktop/src/app/main-window/debug-section.tsx`
- Test: `apps/desktop/tests/app/debug-section.test.tsx`

**Interfaces:**

- Consumes: `Badge`, `Button` (DS); `WrenchIcon` (Task 8).
- Produces:
  - `type DebugAction = { label: string; onClick: () => void }`
  - `type DebugGroup = { title: string; hint: string; items: DebugAction[] }`
  - `interface DebugSectionProps { groups: DebugGroup[]; error: string | null }`
  - `function DebugSection(props: DebugSectionProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/app/debug-section.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebugSection } from "@/app/main-window/debug-section";

describe("DebugSection", () => {
  it("runs a grouped action", () => {
    const onClick = vi.fn();
    render(
      <DebugSection
        error={null}
        groups={[
          {
            title: "Pet windows",
            hint: "overlay control",
            items: [{ label: "Reset pets", onClick }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText("Reset pets"));
    expect(onClick).toHaveBeenCalled();
  });

  it("shows an error when present", () => {
    render(<DebugSection error="boom" groups={[]} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- debug-section`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the section**

Create `apps/desktop/src/app/main-window/debug-section.tsx`:

```tsx
import { Badge, Button } from "@pets-driven/design-system";
import { WrenchIcon } from "@/app/main-window/main-window-icons";

export type DebugAction = { label: string; onClick: () => void };
export type DebugGroup = { title: string; hint: string; items: DebugAction[] };

export interface DebugSectionProps {
  groups: DebugGroup[];
  error: string | null;
}

export function DebugSection({ groups, error }: DebugSectionProps) {
  return (
    <div style={{ padding: "38px 24px 64px" }}>
      <div style={{ maxWidth: "840px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "6px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "24px",
              color: "var(--text-strong)",
              margin: 0,
            }}
          >
            Developer tools
          </h2>
          <Badge tone="warning">dev only</Badge>
        </div>
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            margin: "0 0 20px",
          }}
        >
          Fixtures and playground actions, kept out of the everyday flow.
        </p>

        {error ? (
          <p
            role="status"
            style={{
              color: "var(--coral-600)",
              background: "var(--coral-50)",
              border: "1px solid var(--coral-200)",
              borderRadius: "12px",
              padding: "10px 14px",
              margin: "0 0 16px",
              fontSize: "13px",
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {groups.map((group) => (
            <div
              key={group.title}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-soft)",
                borderRadius: "18px",
                boxShadow: "var(--shadow-sm)",
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "14px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    color: "var(--text-subtle)",
                  }}
                >
                  <WrenchIcon size={16} />
                </span>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "15px",
                    color: "var(--text-strong)",
                    margin: 0,
                  }}
                >
                  {group.title}
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>
                  {group.hint}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {group.items.map((item) => (
                  <Button
                    key={item.label}
                    onClick={item.onClick}
                    size="sm"
                    variant="neutral"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- debug-section`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/debug-section.tsx apps/desktop/tests/app/debug-section.test.tsx
git add apps/desktop/src/app/main-window/debug-section.tsx apps/desktop/tests/app/debug-section.test.tsx
git commit -m "[기타] Add debug section

- Render grouped developer actions and an error banner"
```

---

## Task 13: `MainWindow` shell

**Files:**

- Create: `apps/desktop/src/app/main-window/main-window.tsx`
- Test: `apps/desktop/tests/app/main-window.test.tsx`

**Interfaces:**

- Consumes: `Tabs` (DS); `HomeIcon`, `GearIcon`, `WrenchIcon` (Task 8); `HomeSection`, `PetEditSection`, `SettingsSection`, `DebugSection` and their prop/view types.
- Produces:
  - `type MainWindowTab = "home" | "settings" | "debug"`
  - `interface MainWindowProps` = `{ tab: MainWindowTab; onTab: (tab: MainWindowTab) => void; editPet: PetEditView | null; home: HomeSectionProps; edit: Omit<PetEditSectionProps, "pet">; settings: SettingsSectionProps; debug: DebugSectionProps; toast: string | null }`
  - `function MainWindow(props: MainWindowProps): JSX.Element`

The shell renders the dotted background, the `Tabs` nav, and the active section. When `editPet` is non-null it shows `PetEditSection` regardless of `tab`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/app/main-window.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MainWindow } from "@/app/main-window/main-window";

const home = {
  atHome: [],
  inField: [],
  onDeploy: vi.fn(),
  onRecall: vi.fn(),
  onEdit: vi.fn(),
  onAddPet: vi.fn(),
  onShowAll: vi.fn(),
  onHideAll: vi.fn(),
};
const edit = {
  onName: vi.fn(),
  onMemo: vi.fn(),
  onPickFolder: vi.fn(),
  onToggleDeployed: vi.fn(),
  onDelete: vi.fn(),
  onDone: vi.fn(),
};
const settings = {
  shell: "bash",
  command: "claude",
  onShell: vi.fn(),
  onCommand: vi.fn(),
  confirmRun: true,
  onToggleConfirm: vi.fn(),
  preview: { cwd: "~/core", prompt: "$", command: "claude" },
  hook: {
    tone: "success" as const,
    label: "All connected",
    summary: "ok",
    url: "",
  },
  onReconnect: vi.fn(),
};
const debug = { groups: [], error: null };

function setup(overrides = {}) {
  const props = {
    tab: "home" as const,
    onTab: vi.fn(),
    editPet: null,
    home,
    edit,
    settings,
    debug,
    toast: null,
    ...overrides,
  };
  render(<MainWindow {...props} />);
  return props;
}

describe("MainWindow", () => {
  it("shows the home greeting by default", () => {
    setup();
    expect(screen.getByText("Good morning,")).toBeInTheDocument();
  });

  it("switches tab via the nav", () => {
    const onTab = vi.fn();
    setup({ onTab });
    fireEvent.click(screen.getByText("Settings"));
    expect(onTab).toHaveBeenCalledWith("settings");
  });

  it("shows the edit screen when a pet is being edited", () => {
    setup({
      editPet: {
        id: "otto",
        name: "Otto",
        assetId: "patamon",
        role: "Steady",
        status: { label: "Idle", tone: "neutral", dotColor: "var(--ink-300)" },
        gradient: { from: "#8B7FE8", to: "#6F5FD6" },
        folder: "core",
        memo: "",
        deployed: false,
      },
    });
    expect(screen.getByText("Pet details")).toBeInTheDocument();
  });

  it("renders a toast when present", () => {
    setup({ toast: "Otto is on the desktop" });
    expect(screen.getByText("Otto is on the desktop")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- main-window`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shell**

Create `apps/desktop/src/app/main-window/main-window.tsx`:

```tsx
import { Tabs } from "@pets-driven/design-system";
import {
  GearIcon,
  HomeIcon,
  WrenchIcon,
} from "@/app/main-window/main-window-icons";
import {
  HomeSection,
  type HomeSectionProps,
} from "@/app/main-window/home-section";
import {
  PetEditSection,
  type PetEditSectionProps,
  type PetEditView,
} from "@/app/main-window/pet-edit-section";
import {
  SettingsSection,
  type SettingsSectionProps,
} from "@/app/main-window/settings-section";
import {
  DebugSection,
  type DebugSectionProps,
} from "@/app/main-window/debug-section";
import "@/app/main-window/main-window.css";

export type MainWindowTab = "home" | "settings" | "debug";

export interface MainWindowProps {
  tab: MainWindowTab;
  onTab: (tab: MainWindowTab) => void;
  editPet: PetEditView | null;
  home: HomeSectionProps;
  edit: Omit<PetEditSectionProps, "pet">;
  settings: SettingsSectionProps;
  debug: DebugSectionProps;
  toast: string | null;
}

export function MainWindow({
  tab,
  onTab,
  editPet,
  home,
  edit,
  settings,
  debug,
  toast,
}: MainWindowProps) {
  return (
    <div className="pd-main pd-main__dots">
      <header className="pd-main__header">
        <Tabs
          items={[
            { value: "home", label: "Home", icon: <HomeIcon /> },
            { value: "settings", label: "Settings", icon: <GearIcon /> },
            { value: "debug", label: "Debug", icon: <WrenchIcon /> },
          ]}
          onChange={(value) => onTab(value as MainWindowTab)}
          value={editPet ? "" : tab}
        />
      </header>

      {editPet ? (
        <div className="pd-main__body">
          <PetEditSection pet={editPet} {...edit} />
        </div>
      ) : tab === "home" ? (
        <HomeSection {...home} />
      ) : tab === "settings" ? (
        <div className="pd-main__body">
          <SettingsSection {...settings} />
        </div>
      ) : (
        <div className="pd-main__body">
          <DebugSection {...debug} />
        </div>
      )}

      {toast ? (
        <div className="pd-toast">
          <span aria-hidden="true">🐾</span>
          <span className="pd-toast__label">{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- main-window`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/desktop/src/app/main-window/main-window.tsx apps/desktop/tests/app/main-window.test.tsx
git add apps/desktop/src/app/main-window/main-window.tsx apps/desktop/tests/app/main-window.test.tsx
git commit -m "[기타] Add main window shell

- Compose top nav, sections, edit overlay, and toast"
```

---

## Task 14: Wire `MainWindow` into `PetsDrivenApp`

**Files:**

- Modify: `apps/desktop/src/app/pets-driven-app.tsx`
- Modify: `apps/desktop/src/app/app-navigation.ts`

**Interfaces:**

- Consumes: everything produced above. Uses existing `desktopGateway`, `applyPetsDrivenState`, `petsDrivenStateRef`, `adoptedScenarioRef`, `claudeHookIngressStatus`, and the existing dev-action functions.
- Produces: the running management window. No new exports.

This is the integration task. It is large but mechanical: build the view models and callbacks `MainWindow` needs from state that already exists, add a live-status state fed by the adopted simulation, and replace the `home` / `pets` / `connect` render branches with `<MainWindow/>`.

- [ ] **Step 1: Narrow the navigation type**

In `apps/desktop/src/app/app-navigation.ts`, drop the now-unused `pets` and `connect` views (the management window owns those concerns):

```ts
export type AppView = "home" | "playground" | "onboarding";
```

- [ ] **Step 2: Add per-pet live status state and a tab state**

In `pets-driven-app.tsx`, add imports near the other app imports:

```ts
import { MainWindow, type MainWindowTab } from "@/app/main-window/main-window";
import type { PetEditView } from "@/app/main-window/pet-edit-section";
import type { HomePetView } from "@/app/main-window/home-section";
import {
  petStatusFromSnapshot,
  type PetCardStatus,
} from "@/app-state/pet-card-status";
import { personalityRoleLabel } from "@/app/pet-presentation";
import {
  getWorkingDirectoryForPet,
  registerWorkingDirectory,
} from "@/app-state/pet-adoption";
import { PERSONALITY_OPTIONS } from "@/app/onboarding/personality-options";
```

Add component state near the other `useState` calls:

```ts
const [mainTab, setMainTab] = useState<MainWindowTab>("home");
const [editPetId, setEditPetId] = useState<string | null>(null);
const [toast, setToast] = useState<string | null>(null);
const [petStatusById, setPetStatusById] = useState<
  Record<string, PetCardStatus>
>({});
const toastTimerRef = useRef<number | null>(null);
```

Add a toast helper (place beside the other handler functions):

```ts
function flashToast(message: string) {
  if (toastTimerRef.current !== null) {
    window.clearTimeout(toastTimerRef.current);
  }
  setToast(message);
  toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
}
```

- [ ] **Step 3: Publish live statuses from the adopted simulation loop**

In the adopted-pet `setInterval` body (the loop that calls `scenario.world.step`), after `adoptedHostSequenceRef.current += 1;`, compute and publish statuses from the same snapshot it already takes. Replace the existing snapshot/projection block so the snapshot is reused:

```ts
const snapshot = scenario.world.snapshot();

const nextStatuses: Record<string, PetCardStatus> = {};
for (const petSnapshot of snapshot.pets) {
  nextStatuses[petSnapshot.id] = petStatusFromSnapshot(petSnapshot);
}
setPetStatusById((current) => {
  const sameKeys =
    Object.keys(current).length === Object.keys(nextStatuses).length &&
    Object.keys(nextStatuses).every(
      (id) => current[id]?.label === nextStatuses[id]?.label,
    );
  return sameKeys ? current : nextStatuses;
});

const projections = projectWorldSnapshotToPetWindows(
  snapshot,
  bounds,
  adoptedHostSequenceRef.current,
  adoptedScaleByPetIdRef.current,
);
```

(Remove the prior standalone `projectWorldSnapshotToPetWindows(scenario.world.snapshot(), ...)` call this replaces.)

- [ ] **Step 4: Add gradient + view-model helpers**

Add near the top-level helpers in `pets-driven-app.tsx` (module scope, below the existing `function` helpers):

```ts
const PERSONALITY_GRADIENTS: Record<string, { from: string; to: string }> = {
  playful: { from: "#FF7FB4", to: "#F95E9E" },
  attentive: { from: "#5AC8E8", to: "#2F9CC4" },
  reserved: { from: "#A28BF0", to: "#7560D8" },
  curious: { from: "#5BD08A", to: "#2E9E63" },
  steady: { from: "#8B7FE8", to: "#6F5FD6" },
  bold: { from: "#FF7A5C", to: "#E04428" },
};

function petGradient(personalityId: string | undefined) {
  return (
    PERSONALITY_GRADIENTS[personalityId ?? "steady"] ??
    PERSONALITY_GRADIENTS.steady
  );
}
```

- [ ] **Step 5: Build the view models inside the component (before the return)**

Just before the existing `return (` that renders `<main className="app-shell">`, build the data `MainWindow` needs from `petsDrivenState`:

```ts
const managedPets = petsDrivenState.pets.filter((pet) => !pet.archived);
const profileFor = (pet: (typeof managedPets)[number]) =>
  petsDrivenState.petProfiles.find((profile) => profile.id === pet.profileId);
const statusFor = (petId: string): PetCardStatus =>
  petStatusById[petId] ?? {
    label: "Idle",
    tone: "neutral",
    dotColor: "var(--ink-300)",
  };

const atHome: HomePetView[] = managedPets
  .filter((pet) => !pet.visible)
  .map((pet) => {
    const personalityId = profileFor(pet)?.personalityId;
    return {
      id: pet.id,
      name: pet.name,
      assetId: pet.assetId,
      role: personalityRoleLabel(personalityId),
      status: statusFor(pet.id),
      gradient: petGradient(personalityId),
    };
  });

const inField = managedPets
  .filter((pet) => pet.visible)
  .map((pet) => ({
    id: pet.id,
    name: pet.name,
    color: petGradient(profileFor(pet)?.personalityId).from,
  }));

const editingPet = managedPets.find((pet) => pet.id === editPetId) ?? null;
const editPetView: PetEditView | null = editingPet
  ? {
      id: editingPet.id,
      name: editingPet.name,
      assetId: editingPet.assetId,
      role: personalityRoleLabel(profileFor(editingPet)?.personalityId),
      status: statusFor(editingPet.id),
      gradient: petGradient(profileFor(editingPet)?.personalityId),
      folder:
        getWorkingDirectoryForPet(petsDrivenState, editingPet.id)?.path ?? "",
      memo: editingPet.memo ?? "",
      deployed: editingPet.visible,
    }
  : null;

const previewPet = managedPets[0];
const previewDir = previewPet
  ? (getWorkingDirectoryForPet(petsDrivenState, previewPet.id)?.path ?? "core")
  : "core";
const shellPrompt = petsDrivenState.sessionCommand.startsWith("cmd")
  ? "C:\\>"
  : "$";
const detectedShell = petsDrivenState.sessionCommand.startsWith("cmd")
  ? "cmd"
  : "bash";
```

- [ ] **Step 6: Add the pet mutation callbacks**

Add these handlers beside the existing ones (they reuse `applyPetsDrivenState` + `desktopGateway` exactly like `updateSessionCommand`):

```ts
function patchPet(petId: string, patch: Partial<PetRecord>) {
  const current = petsDrivenStateRef.current;
  const next: PetsDrivenState = {
    ...current,
    pets: current.pets.map((pet) =>
      pet.id === petId ? { ...pet, ...patch } : pet,
    ),
  };
  applyPetsDrivenState(next);
  void desktopGateway.writePetsDrivenState(next);
}

function deployPet(petId: string) {
  const pet = petsDrivenStateRef.current.pets.find((p) => p.id === petId);
  patchPet(petId, { visible: true });
  void desktopGateway
    .openAdoptedPetWindow(petId, pet?.assetId ?? "")
    .catch(() => {});
  if (pet) {
    flashToast(`${pet.name} is on the desktop`);
  }
}

function recallPet(petId: string) {
  const pet = petsDrivenStateRef.current.pets.find((p) => p.id === petId);
  patchPet(petId, { visible: false });
  if (pet) {
    flashToast(`${pet.name} came home`);
  }
}

function deployAllPets() {
  for (const pet of petsDrivenStateRef.current.pets.filter(
    (p) => !p.archived,
  )) {
    patchPet(pet.id, { visible: true });
    void desktopGateway
      .openAdoptedPetWindow(pet.id, pet.assetId)
      .catch(() => {});
  }
}

function recallAllPets() {
  const current = petsDrivenStateRef.current;
  const next: PetsDrivenState = {
    ...current,
    pets: current.pets.map((pet) => ({ ...pet, visible: false })),
  };
  applyPetsDrivenState(next);
  void desktopGateway.writePetsDrivenState(next);
}

function deletePet(petId: string) {
  const pet = petsDrivenStateRef.current.pets.find((p) => p.id === petId);
  if (
    !pet ||
    !window.confirm(`Send ${pet.name} home for good? This removes the pet.`)
  ) {
    return;
  }
  patchPet(petId, { archived: true, visible: false });
  setEditPetId(null);
  flashToast(`${pet.name} was removed`);
}

async function pickFolderForPet(petId: string) {
  const path = await desktopGateway.pickDirectory();
  if (!path) {
    return;
  }
  const result = registerWorkingDirectory(petsDrivenStateRef.current, {
    petId,
    path,
    workingDirectoryId: crypto.randomUUID(),
    agentSourceId: crypto.randomUUID(),
    now: Date.now(),
  });
  if (result.status === "occupied") {
    flashToast("That folder already belongs to another pet");
    return;
  }
  applyPetsDrivenState(result.state);
  void desktopGateway.writePetsDrivenState(result.state);
}

function setSessionShell(shell: string) {
  const command = petsDrivenStateRef.current.sessionCommand;
  if (shell === "cmd" && !command.startsWith("cmd")) {
    updateSessionCommand(
      `cmd /k ${command.replace(/^bash\s+-lc\s+/, "")}`.trim(),
    );
  } else if (shell === "bash" && command.startsWith("cmd")) {
    updateSessionCommand(command.replace(/^cmd\s+\/k\s+/, "").trim());
  }
}
```

- [ ] **Step 7: Replace the render branches with `MainWindow`**

Delete the `if (view === "pets" || view === "connect")` block and the entire final `return (<main className="app-shell">…</main>)`, replacing the latter with:

```tsx
return (
  <MainWindow
    debug={{
      error: petWindowError,
      groups: [
        {
          title: "Pets",
          hint: "adoption & state",
          items: [
            { label: "Adopt a pet", onClick: () => navigate("onboarding") },
            { label: "Reset pets", onClick: () => void resetPets() },
            { label: "Show all pets", onClick: () => void openAllPets() },
            { label: "Close all pets", onClick: () => void closeAllPets() },
          ],
        },
        {
          title: "Simulation",
          hint: "world & playground",
          items: [
            { label: "Reset simulation", onClick: resetAdoptedSimulation },
            { label: "Open playground", onClick: () => navigate("playground") },
          ],
        },
        {
          title: "Pet windows",
          hint: "overlay fixtures",
          items: [
            {
              label: "Open pet window",
              onClick: () =>
                void invokePetWindowCommand("open_pet_window_playground", 1),
            },
            {
              label: "Open 3 pet windows",
              onClick: () =>
                void invokePetWindowCommand("open_pet_window_playground", 3),
            },
            {
              label: "Open fixture windows",
              onClick: () =>
                void invokePetWindowCommand("open_pet_window_playground", 7),
            },
            {
              label: "Close pet windows",
              onClick: () =>
                void invokePetWindowCommand("close_pet_window_playground"),
            },
          ],
        },
        {
          title: "Claude hook",
          hint: "ingress testing",
          items: [
            {
              label: "Test event",
              onClick: () => void emitClaudeHookTestEvent(),
            },
            { label: "Poke pet", onClick: () => void pokeFirstPet() },
          ],
        },
      ],
    }}
    edit={{
      onName: (value) => editPetId && patchPet(editPetId, { name: value }),
      onMemo: (value) => editPetId && patchPet(editPetId, { memo: value }),
      onPickFolder: () => editPetId && void pickFolderForPet(editPetId),
      onToggleDeployed: () =>
        editPetId &&
        (editingPet?.visible ? recallPet(editPetId) : deployPet(editPetId)),
      onDelete: () => editPetId && deletePet(editPetId),
      onDone: () => setEditPetId(null),
    }}
    editPet={editPetView}
    home={{
      atHome,
      inField,
      onDeploy: deployPet,
      onRecall: recallPet,
      onEdit: (petId) => setEditPetId(petId),
      onAddPet: () => navigate("onboarding"),
      onShowAll: deployAllPets,
      onHideAll: recallAllPets,
    }}
    onTab={(next) => {
      setEditPetId(null);
      setMainTab(next);
    }}
    settings={{
      shell: detectedShell,
      command: petsDrivenState.sessionCommand,
      onShell: setSessionShell,
      onCommand: updateSessionCommand,
      confirmRun: true,
      onToggleConfirm: () => {},
      preview: {
        cwd: (detectedShell === "cmd" ? "C:\\pets\\" : "~/") + previewDir,
        prompt: shellPrompt,
        command: petsDrivenState.sessionCommand,
      },
      hook: {
        tone:
          claudeHookIngressStatus.state === "ready"
            ? "success"
            : claudeHookIngressStatus.state === "pending"
              ? "info"
              : "danger",
        label:
          claudeHookIngressStatus.state === "ready"
            ? "All connected"
            : claudeHookIngressStatus.state === "pending"
              ? "Connecting"
              : "Offline",
        summary: `Claude hook ${claudeHookIngressStatus.state}`,
        url: claudeHookIngressStatus.url,
      },
      onReconnect: () => void emitClaudeHookTestEvent(),
    }}
    tab={mainTab}
    toast={toast}
  />
);
```

Also remove the now-unused `Badge`, `Button`, `Card` import if no longer referenced after deleting the old markup, and delete `PERSONALITY_OPTIONS` from the import added in Step 2 if it ends up unused (it is only needed if you inline titles; `personalityRoleLabel` already covers it — remove the import to avoid an unused-symbol error).

- [ ] **Step 8: Typecheck and run the full desktop suite**

Run: `pnpm --filter pets-driven typecheck`
Expected: PASS (no unused symbols, no type errors).

Run: `pnpm --filter pets-driven test`
Expected: PASS (all suites, including the new section tests).

- [ ] **Step 9: Commit**

```bash
npx prettier --write apps/desktop/src/app/pets-driven-app.tsx apps/desktop/src/app/app-navigation.ts
git add apps/desktop/src/app/pets-driven-app.tsx apps/desktop/src/app/app-navigation.ts
git commit -m "[기타] Render the Desktop Main v2 management window

- Replace the developer dashboard with the MainWindow shell
- Publish live pet statuses from the adopted simulation snapshot
- Wire deploy/recall, edit (name/folder/note/delete), settings, and debug actions"
```

---

## Task 15: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Workspace typecheck**

Run: `pnpm -r typecheck`
Expected: PASS for `@pets-driven/design-system` and `pets-driven`. (Pre-existing pet-engine issues, if any, are out of scope — confirm no _new_ errors in the two packages this plan touches.)

- [ ] **Step 2: Workspace tests**

Run: `pnpm -r test`
Expected: PASS, including `pet-card-status`, `pet-presentation`, `home-section`, `pet-edit-section`, `settings-section`, `debug-section`, `main-window`, and `pets-driven-state-migration`.

- [ ] **Step 3: Manual smoke (browser dev)**

Run: `pnpm --filter pets-driven dev:playground` is for the playground; for the app shell use `pnpm --filter pets-driven dev` under Tauri. In a plain browser (`vite`), verify: the dotted background renders, the nav switches Home/Settings/Debug, the greeting and "Add a pet" show, and a seeded dev pet appears as a card. (Full deploy/overlay behavior requires Tauri.)

- [ ] **Step 4: Manual smoke (Tauri), if available**

Launch the Tauri app. Verify: deploy a pet from a card (it appears on the desktop, card moves to "In the field"), recall via the chip, edit a pet's name/note and confirm persistence across reload, change the session command/shell and watch the terminal preview update, and exercise a Debug action.

- [ ] **Step 5: Finalize**

No commit needed unless verification surfaced fixes. If fixes were made, commit them with a `[기타]` message describing the fix.

---

## Self-Review

**Spec coverage:**

- Four sections + nav + toast → Tasks 9–13 (sections), Task 13 (nav/toast shell), Task 14 (wiring). ✓
- New DS components (PetShowcaseCard, SegmentedControl, TerminalPreview) → Tasks 4–6. ✓
- Live status from the adopted snapshot → Task 2 (helper) + Task 14 Step 3 (publish). ✓
- Role = personality → Task 3 + Task 14 view models. ✓
- Portrait = real sprite → Task 7. ✓
- `memo` field → Task 1. ✓
- Send-to-field = visible/overlay semantics, Show/Hide all → Task 14 Steps 5–7. ✓
- Settings wired to sessionCommand + claude hook → Task 11 + Task 14. ✓
- Debug houses existing dev actions → Task 12 + Task 14 Step 7. ✓
- Add a pet → onboarding → Task 14 (home `onAddPet`). ✓
- Folder editing via existing mechanism → Task 14 `pickFolderForPet` (uses `desktopGateway.pickDirectory` + `registerWorkingDirectory`; the spec's display-only fallback is unnecessary because the picker command exists). ✓
- Testing: helper unit tests + section smoke tests + migration test + manual → Tasks 1–15. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". `confirmRun` is explicitly an un-persisted constant per spec scope, not a placeholder. ✓

**Type consistency:** `PetCardStatus` (Task 2) is reused by `HomePetView` (Task 9), `PetEditView` (Task 10), and Task 14. `PetShowcaseCardStatus` is `{ label, dotColor }` (Task 6) and every `status={{ label, dotColor }}` call passes exactly those. `BadgeTone` flows from DS into `PetCardStatus.tone` and `SettingsSectionProps.hook.tone`. `patchPet`, `deployPet`, `recallPet`, `pickFolderForPet` names are consistent across Task 14. `PetRecord`/`PetsDrivenState` are imported in `pets-driven-app.tsx` already (Task 14 uses them in `patchPet`). ✓
