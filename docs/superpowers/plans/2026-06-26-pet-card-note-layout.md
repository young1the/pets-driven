# Pet Card Note Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update pet cards so they render note first, name second, and personality as a smaller separate area.

**Architecture:** Keep the shared layout change inside `PetShowcaseCard` so Home and Pet Edit preview stay visually consistent. Flow `PetRecord.memo` through the desktop view models, then verify the new hierarchy with app-level rendering tests before and after the implementation.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, CSS modules via imported stylesheet files

---

### Task 1: Lock the requested card hierarchy with failing tests

**Files:**
- Modify: `D:\pets-driven\apps\desktop\tests\app\home-section.test.tsx`
- Modify: `D:\pets-driven\apps\desktop\tests\app\pet-edit-section.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
const pet = {
  id: "otto",
  name: "Otto",
  assetId: "patamon",
  note: "Watch the auth queue",
  role: "Steady",
  status: {
    label: "Idle",
    tone: "neutral" as const,
    dotColor: "var(--ink-300)",
  },
  gradient: { from: "#8B7FE8", to: "#6F5FD6" },
};

expect(screen.getByText("Watch the auth queue")).toBeInTheDocument();
expect(screen.getByText("Steady")).toBeInTheDocument();
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm --filter pets-driven test -- tests/app/home-section.test.tsx tests/app/pet-edit-section.test.tsx`
Expected: FAIL because the card view models and shared component do not accept or render `note` yet.

### Task 2: Update the shared card layout

**Files:**
- Modify: `D:\pets-driven\packages\design-system\src\components\pet-showcase\pet-showcase-card.tsx`
- Modify: `D:\pets-driven\packages\design-system\src\components\pet-showcase\pet-showcase-card.css`

- [ ] **Step 1: Add the new `note` prop and render order**

```tsx
export interface PetShowcaseCardProps {
  note: string;
  role: string;
  name: string;
  status: PetShowcaseCardStatus;
  gradient: { from: string; to: string };
  portrait: ReactNode;
  featured?: boolean;
  onEdit?: () => void;
  className?: string;
}

<div className="pd-pet-card__head">
  <div className="pd-pet-card__note">{note}</div>
  <div className="pd-pet-card__name">{name}</div>
</div>
```

- [ ] **Step 2: Add a smaller separate personality area**

```tsx
<div className="pd-pet-card__footer">
  <div className="pd-pet-card__role-chip">{role}</div>
  <div className="pd-pet-card__status">...</div>
</div>
```

- [ ] **Step 3: Style the new hierarchy**

```css
.pd-pet-card__note {
  font-size: 10px;
  font-weight: 700;
}

.pd-pet-card__footer {
  position: absolute;
  left: 12px;
  bottom: 12px;
}
```

### Task 3: Wire memo into card call sites and re-run tests

**Files:**
- Modify: `D:\pets-driven\apps\desktop\src\app\main-window\home-section.tsx`
- Modify: `D:\pets-driven\apps\desktop\src\app\main-window\pet-edit-section.tsx`
- Modify: `D:\pets-driven\apps\desktop\src\app\pets-driven-app.tsx`

- [ ] **Step 1: Extend the view models with note text**

```ts
export type HomePetView = {
  id: string;
  name: string;
  assetId: string;
  note: string;
  role: string;
  status: PetCardStatus;
  gradient: { from: string; to: string };
};
```

- [ ] **Step 2: Pass `memo` into the shared card**

```tsx
<PetShowcaseCard
  featured={hovered}
  gradient={pet.gradient}
  name={pet.name}
  note={pet.note}
  portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
  role={pet.role}
  status={{
    label: pet.status.label,
    dotColor: pet.status.dotColor,
  }}
/>
```

- [ ] **Step 3: Run the targeted tests to verify they pass**

Run: `pnpm --filter pets-driven test -- tests/app/home-section.test.tsx tests/app/pet-edit-section.test.tsx`
Expected: PASS

- [ ] **Step 4: Run a focused type-level safety check**

Run: `pnpm --filter pets-driven typecheck`
Expected: PASS
