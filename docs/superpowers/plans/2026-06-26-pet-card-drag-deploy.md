# Pet Card Drag-to-Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the home screen, make a card click open the detail screen and make dragging a card onto a centre drop zone deploy it to the desktop, removing the pencil button.

**Architecture:** All gesture handling lives in `home-section.tsx`. A `pointerdown` on a card records the start point in a ref; window-level `pointermove`/`pointerup` listeners (bound once via `useEffect`) track the drag and decide the outcome on release — under a 6px threshold it is a click (open detail), over the drop zone it is a deploy, otherwise it springs back. The drop zone is an always-visible square dashed "field" centred in the hero region, hit-tested via `getBoundingClientRect`.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react (jsdom), plain CSS in `main-window.css`. No drag library.

## Global Constraints

- Parent wiring is unchanged: `HomeSectionProps` keeps `onDeploy`, `onRecall`, `onEdit`, `onAddPet`, `onShowAll`, `onHideAll` with identical signatures.
- No drag/gesture library — native Pointer Events only.
- Do not modify the shared `PetShowcaseCard` design-system component; the home screen simply stops passing `onEdit` to it.
- Drag threshold: `6` px (Euclidean distance from pointerdown origin).
- Drop zone is a **square** dashed border (rounded corners ok), not a circle — a "field" feel.
- Use existing CSS variables already present in `main-window.css` / design system (e.g. `--border-soft`, `--blossom-600`); do not invent new variable names.

---

### Task 1: Always-visible square dashed drop zone

Add the static "field" drop zone markup and CSS. No behaviour yet — this task only proves the zone renders and is queryable for later hit-testing.

**Files:**

- Modify: `apps/desktop/src/app/main-window/home-section.tsx` (add drop zone element inside `.pd-home`)
- Modify: `apps/desktop/src/app/main-window/main-window.css` (add `.pd-home__dropzone` styles)
- Test: `apps/desktop/tests/app/home-section.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: a drop zone element `ref={dropZoneRef}` carrying `data-testid="home-dropzone"` and class `pd-home__dropzone`, positioned absolutely in the centre of `.pd-home`. Task 2 reads `dropZoneRef.current.getBoundingClientRect()` and toggles a `pd-home__dropzone--active` class.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("HomeSection", ...)` block in `apps/desktop/tests/app/home-section.test.tsx`:

```tsx
it("renders the centre deploy drop zone", () => {
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

  expect(screen.getByTestId("home-dropzone")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test -- home-section`
Expected: FAIL — `Unable to find an element by: [data-testid="home-dropzone"]`

- [ ] **Step 3: Add the drop zone markup**

In `home-section.tsx`, add a `useRef` import and the ref near the top of `HomeSection`:

```tsx
import { useRef, useState, type CSSProperties } from "react";
```

```tsx
export function HomeSection({
  atHome,
  inField,
  onDeploy,
  onRecall,
  onEdit,
  onAddPet,
}: HomeSectionProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
```

Add the drop zone element immediately after the opening `<div className="pd-home">` and before the radial-gradient div:

```tsx
  return (
    <div className="pd-home">
      <div
        ref={dropZoneRef}
        className="pd-home__dropzone"
        data-testid="home-dropzone"
        aria-hidden="true"
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "-160px",
```

- [ ] **Step 4: Add the drop zone CSS**

Append to `apps/desktop/src/app/main-window/main-window.css` (after the existing `.pd-home__fan-card` rule):

```css
.pd-home__dropzone {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  width: 380px;
  height: 300px;
  border: 2px dashed var(--border-soft);
  border-radius: 28px;
  opacity: 0.35;
  pointer-events: none;
  z-index: 5;
  transition:
    opacity 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.pd-home__dropzone--active {
  opacity: 1;
  border-color: var(--blossom-600);
  background: rgba(249, 94, 158, 0.06);
  transform: translate(-50%, -50%) scale(1.04);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter pets-driven test -- home-section`
Expected: PASS — all `HomeSection` tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/main-window/home-section.tsx apps/desktop/src/app/main-window/main-window.css apps/desktop/tests/app/home-section.test.tsx
git commit -m "[개선 #] 홈 화면 중앙에 네모난 점선 드롭존 추가

- pd-home__dropzone 항상 표시되는 사각 점선 field 영역 추가
- 드래그 hit-test용 dropZoneRef / data-testid 노출"
```

---

### Task 2: Click-to-detail and drag-to-deploy interaction

Replace the click-to-deploy behaviour with: click opens detail, drag onto the drop zone deploys, drag elsewhere springs back. Remove the pencil button and update the aria-label and keyboard handler.

**Files:**

- Modify: `apps/desktop/src/app/main-window/home-section.tsx`
- Modify: `apps/desktop/src/app/main-window/main-window.css` (drag-active card rule)
- Test: `apps/desktop/tests/app/home-section.test.tsx`

**Interfaces:**

- Consumes: `dropZoneRef` and `data-testid="home-dropzone"` from Task 1; the existing `onEdit(petId)` and `onDeploy(petId)` props.
- Produces: each fan card uses `role="button"`, `aria-label={`Open ${pet.name}'s details`}`, an `onPointerDown` handler, and no longer renders the pencil (no `onEdit` passed to `PetShowcaseCard`). The drag uses module constant `DRAG_THRESHOLD = 6`.

- [ ] **Step 1: Replace the click test and add interaction tests**

In `apps/desktop/tests/app/home-section.test.tsx`, **delete** the existing test `it("deploys a pet when its card is clicked", ...)` (lines ~60-77) and add these tests inside the `describe` block. Note `fireEvent.pointerMove`/`pointerUp` target `window` because the listeners are bound there:

```tsx
it("opens the detail screen when a card is clicked without dragging", () => {
  const onEdit = vi.fn();
  const onDeploy = vi.fn();
  render(
    <HomeSection
      atHome={[pet]}
      inField={[]}
      onDeploy={onDeploy}
      onRecall={vi.fn()}
      onEdit={onEdit}
      onAddPet={vi.fn()}
      onShowAll={vi.fn()}
      onHideAll={vi.fn()}
    />,
  );

  const card = screen.getByRole("button", { name: "Open Otto's details" });
  fireEvent.pointerDown(card, {
    button: 0,
    clientX: 100,
    clientY: 500,
    pointerId: 1,
  });
  fireEvent.pointerUp(window, { clientX: 100, clientY: 500, pointerId: 1 });

  expect(onEdit).toHaveBeenCalledWith("otto");
  expect(onDeploy).not.toHaveBeenCalled();
});

it("deploys a pet when its card is dragged onto the drop zone", () => {
  const onEdit = vi.fn();
  const onDeploy = vi.fn();
  render(
    <HomeSection
      atHome={[pet]}
      inField={[]}
      onDeploy={onDeploy}
      onRecall={vi.fn()}
      onEdit={onEdit}
      onAddPet={vi.fn()}
      onShowAll={vi.fn()}
      onHideAll={vi.fn()}
    />,
  );

  const dropzone = screen.getByTestId("home-dropzone");
  dropzone.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 200,
        right: 600,
        top: 100,
        bottom: 400,
        width: 400,
        height: 300,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect,
  );

  const card = screen.getByRole("button", { name: "Open Otto's details" });
  fireEvent.pointerDown(card, {
    button: 0,
    clientX: 100,
    clientY: 500,
    pointerId: 1,
  });
  fireEvent.pointerMove(window, { clientX: 400, clientY: 250, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: 400, clientY: 250, pointerId: 1 });

  expect(onDeploy).toHaveBeenCalledWith("otto");
  expect(onEdit).not.toHaveBeenCalled();
});

it("springs back without deploying when released outside the drop zone", () => {
  const onEdit = vi.fn();
  const onDeploy = vi.fn();
  render(
    <HomeSection
      atHome={[pet]}
      inField={[]}
      onDeploy={onDeploy}
      onRecall={vi.fn()}
      onEdit={onEdit}
      onAddPet={vi.fn()}
      onShowAll={vi.fn()}
      onHideAll={vi.fn()}
    />,
  );

  const dropzone = screen.getByTestId("home-dropzone");
  dropzone.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 200,
        right: 600,
        top: 100,
        bottom: 400,
        width: 400,
        height: 300,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect,
  );

  const card = screen.getByRole("button", { name: "Open Otto's details" });
  fireEvent.pointerDown(card, {
    button: 0,
    clientX: 100,
    clientY: 500,
    pointerId: 1,
  });
  fireEvent.pointerMove(window, { clientX: 120, clientY: 120, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: 120, clientY: 120, pointerId: 1 });

  expect(onDeploy).not.toHaveBeenCalled();
  expect(onEdit).not.toHaveBeenCalled();
});

it("does not render the pencil edit button on cards", () => {
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

  expect(
    screen.queryByRole("button", { name: "Edit pet" }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter pets-driven test -- home-section`
Expected: FAIL — the new tests fail (card found by old aria-label, pointer handlers absent; `onEdit`/`onDeploy` not called as expected; pencil still rendered).

- [ ] **Step 3: Add drag state, refs, and window listeners**

In `home-section.tsx`, update the import and add the module constant near the top of the file (after the imports):

```tsx
import { useEffect, useRef, useState, type CSSProperties } from "react";
```

```tsx
const DRAG_THRESHOLD = 6;
```

Inside `HomeSection`, after the existing `dropZoneRef` line, add the drag refs/state and the listener effect:

```tsx
const dropZoneRef = useRef<HTMLDivElement>(null);
const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(
  null,
);
const [dragVisual, setDragVisual] = useState<{
  id: string;
  dx: number;
  dy: number;
  over: boolean;
} | null>(null);

const onEditRef = useRef(onEdit);
onEditRef.current = onEdit;
const onDeployRef = useRef(onDeploy);
onDeployRef.current = onDeploy;

useEffect(() => {
  function isOverDropZone(clientX: number, clientY: number): boolean {
    const rect = dropZoneRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function handleMove(event: PointerEvent) {
    const active = dragRef.current;
    if (!active) {
      return;
    }
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD;
    setDragVisual({
      id: active.id,
      dx,
      dy,
      over: moved && isOverDropZone(event.clientX, event.clientY),
    });
  }

  function handleUp(event: PointerEvent) {
    const active = dragRef.current;
    if (!active) {
      return;
    }
    dragRef.current = null;
    setDragVisual(null);

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD;

    if (!moved) {
      onEditRef.current(active.id);
    } else if (isOverDropZone(event.clientX, event.clientY)) {
      onDeployRef.current(active.id);
    }
    // else: dropped outside — clearing dragVisual springs the card back.
  }

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  return () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
  };
}, []);

function handleCardPointerDown(
  event: React.PointerEvent<HTMLDivElement>,
  petId: string,
) {
  if (event.button !== 0) {
    return;
  }
  dragRef.current = {
    id: petId,
    startX: event.clientX,
    startY: event.clientY,
  };
  setDragVisual({ id: petId, dx: 0, dy: 0, over: false });
}
```

- [ ] **Step 4: Toggle the drop zone active class**

Update the drop zone element to reflect drag-over state:

```tsx
<div
  ref={dropZoneRef}
  className={[
    "pd-home__dropzone",
    dragVisual?.over ? "pd-home__dropzone--active" : "",
  ]
    .filter(Boolean)
    .join(" ")}
  data-testid="home-dropzone"
  aria-hidden="true"
/>
```

- [ ] **Step 5: Rewire the fan card — pointer drag, detail click, keyboard, remove pencil**

Replace the fan card `map` body (the `wrapStyle` and the returned `<div className="pd-home__fan-card" ...>`) with this version. It computes a dragging transform, swaps the click handler for pointer/keyboard handlers, updates the aria-label, and stops passing `onEdit` to `PetShowcaseCard`:

```tsx
{
  ordered.map(({ pet, index, center }) => {
    const d = index - center;
    const ty = Math.abs(d) * 22;
    const hovered = hoverId === pet.id;
    const dragging = dragVisual?.id === pet.id;
    const wrapStyle: CSSProperties = {
      left: `calc(50% + ${d * stepX}px)`,
      transform: dragging
        ? `translate(calc(-50% + ${dragVisual.dx}px), ${ty + dragVisual.dy}px) scale(1.06)`
        : hovered
          ? `translateX(-50%) translateY(${ty - 46}px) rotate(${d * 2}deg) scale(1.1)`
          : `translateX(-50%) translateY(${ty}px) rotate(${d * rotX}deg)`,
      zIndex: dragging ? 300 : hovered ? 200 : 60 - Math.round(Math.abs(d) * 6),
    };

    return (
      <div
        className={[
          "pd-home__fan-card",
          dragging ? "pd-home__fan-card--dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        key={pet.id}
        role="button"
        tabIndex={0}
        aria-label={`Open ${pet.name}'s details`}
        onPointerDown={(event) => handleCardPointerDown(event, pet.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onEdit(pet.id);
          }
        }}
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
          note={pet.note}
          portrait={<PetPortrait assetId={pet.assetId} name={pet.name} />}
          role={pet.role}
          status={{
            label: pet.status.label,
            dotColor: pet.status.dotColor,
          }}
        />
      </div>
    );
  });
}
```

- [ ] **Step 6: Disable the spring transition while dragging**

Append to `apps/desktop/src/app/main-window/main-window.css` (after the `.pd-home__dropzone--active` rule):

```css
.pd-home__fan-card--dragging {
  transition: none;
  cursor: grabbing;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter pets-driven test -- home-section`
Expected: PASS — all `HomeSection` tests green (click opens detail, drag-onto-zone deploys, drag-outside springs back, no pencil).

- [ ] **Step 8: Run the full desktop test suite and typecheck**

Run: `pnpm --filter pets-driven test` and `pnpm --filter pets-driven typecheck`
Expected: PASS — no regressions, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/main-window/home-section.tsx apps/desktop/src/app/main-window/main-window.css apps/desktop/tests/app/home-section.test.tsx
git commit -m "[개선 #] 홈 카드 클릭은 상세, 중앙 드롭존 드래그는 데스크탑 배포

- 카드 클릭 → onEdit(상세화면), 기존 클릭 배포 제거
- window pointer 리스너로 드래그 추적, 6px 임계값으로 클릭/드래그 구분
- 드롭존 위에서 release 시 onDeploy, 밖이면 스프링백
- 카드 연필 버튼 제거 및 aria-label/키보드 핸들러 갱신"
```

---

## Self-Review

**Spec coverage:**

- Click → detail: Task 2 (click test + `onEdit` wiring). ✓
- Drag onto centre zone → deploy: Task 2 (drag test + `onDeploy` on drop zone release). ✓
- Spring back outside zone: Task 2 (spring-back test, dragVisual cleared restores fan transform via CSS transition). ✓
- Always-visible square dashed drop zone, emphasised on drag-over: Task 1 (markup + CSS) + Task 2 (`--active` toggle). ✓
- Remove pencil button: Task 2 (no `onEdit` passed to `PetShowcaseCard`; pencil-absent test). ✓
- Keyboard accessibility (Enter/Space → detail): Task 2 (`onKeyDown` → `onEdit`). ✓
- Parent wiring unchanged: no edits to `pets-driven-app.tsx`; props unchanged. ✓
- `PetShowcaseCard.onEdit` prop kept in design system: component untouched. ✓

**Placeholder scan:** No TBD/TODO; all steps carry concrete code and commands. Commit subjects use `[개선 #]` per the user's commit format (issue number unknown — leave `#` for the implementer to fill or switch to `[기타]` if no issue applies).

**Type consistency:** `dragRef` shape `{ id, startX, startY }` and `dragVisual` shape `{ id, dx, dy, over }` are used consistently across the effect, `handleCardPointerDown`, and the render block. `isOverDropZone(clientX, clientY): boolean`, `DRAG_THRESHOLD = 6`, and `dropZoneRef`/`data-testid="home-dropzone"` match between Task 1 and Task 2.

**Note on commit messages:** Per the user's CLAUDE.md, if a Redmine issue number is known at implementation time, replace `#` with it; otherwise use `[기타]`. Never add `Co-Authored-By`. Run prettier before committing.
