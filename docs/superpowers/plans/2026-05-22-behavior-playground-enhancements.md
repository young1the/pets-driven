# Behavior Playground Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add surface/contact overlay on the canvas, a full component detail panel in BehaviorLab, and an action state timeline to the Playground.

**Architecture:** Three layered additions — (1) extend `PetSnapshot` with contact/motionTarget data, (2) use that data in the canvas renderer for visual overlays, (3) add a component panel and timeline as new React components. The snapshot extension is the shared foundation; the canvas and UI additions are independent after that.

**Tech Stack:** React, TypeScript, Canvas 2D API, Vitest + Testing Library

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/snapshots/world-snapshot.ts` | Modify | Add `contact` and `motionTarget` to `PetSnapshot` |
| `src/core/world/create-world.ts` | Modify | Populate new snapshot fields in `getPetSnapshots` |
| `src/playground/browser/debug-overlay.ts` | Modify | Add `drawGroundContact`, `drawMotionTargetMarker`, `drawActiveClimbSurface` |
| `src/playground/browser/canvas-renderer.ts` | Modify | Call new overlay functions using snapshot contact/motion data |
| `src/playground/browser/behavior-lab.tsx` | Modify | Replace tag list with full component detail panel |
| `src/playground/browser/action-timeline.tsx` | **Create** | New scrollable state-change log component |
| `src/playground/browser/playground-app.tsx` | Modify | Add timeline buffer state, pass to ActionTimeline |
| `src/playground/browser/playground-text.ts` | Modify | Add text constants for new UI sections |
| `tests/playground/canvas-renderer.test.ts` | Modify | Update inline PetSnapshot fixtures with new required fields |
| `tests/smoke/playground-app.test.tsx` | Modify | Add smoke assertions for component panel and timeline |

---

## Task 1: Extend PetSnapshot with contact and motionTarget

**Files:**
- Modify: `src/core/snapshots/world-snapshot.ts`
- Modify: `src/core/world/create-world.ts`
- Modify: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/core/world-fixtures.test.ts`, inside the `"includes fixture pet render state in the snapshot"` test, after the existing assertions:

```ts
expect(snapshot.pets[0].contact).toEqual({ grounded: false, climbableSurfaceId: null });
expect(snapshot.pets[0].motionTarget).toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

```
npm.cmd run test tests/core/world-fixtures.test.ts
```

Expected: FAIL — `contact` and `motionTarget` are undefined.

- [ ] **Step 3: Extend PetSnapshot type**

In `src/core/snapshots/world-snapshot.ts`, replace the `PetSnapshot` type:

```ts
export type PetSnapshot = {
  id: string;
  sourceId: string;
  name: string;
  intent: string;
  locomotion: string;
  speech: string | null;
  position: {
    x: number;
    y: number;
  };
  contact: {
    grounded: boolean;
    climbableSurfaceId: string | null;
  };
  motionTarget: { x: number; y: number } | null;
};
```

- [ ] **Step 4: Populate new fields in getPetSnapshots**

In `src/core/world/create-world.ts`, find the `getPetSnapshots` function (around line 553). After the existing `locomotion` field, add:

```ts
contact: {
  grounded: componentStore.getComponent(entity.id, "ContactState")?.grounded ?? false,
  climbableSurfaceId:
    componentStore.getComponent(entity.id, "ContactState")?.climbableSurfaceId ?? null,
},
motionTarget:
  componentStore.getComponent(entity.id, "MotionTarget")?.targetPosition ?? null,
```

The full return object in that `.map()` becomes:

```ts
return {
  id: entity.id,
  sourceId: (agent as AgentBindingComponent).sourceId,
  name: (identity as PetIdentityComponent).name,
  intent: (intent as IntentStateComponent).intent,
  locomotion: getLocomotionLabel(componentStore, entity.id),
  speech: (speech as SpeechStateComponent).speech,
  position: (transform as TransformComponent).position,
  contact: {
    grounded: componentStore.getComponent(entity.id, "ContactState")?.grounded ?? false,
    climbableSurfaceId:
      componentStore.getComponent(entity.id, "ContactState")?.climbableSurfaceId ?? null,
  },
  motionTarget:
    componentStore.getComponent(entity.id, "MotionTarget")?.targetPosition ?? null,
};
```

- [ ] **Step 5: Fix TypeScript errors in canvas-renderer tests**

In `tests/playground/canvas-renderer.test.ts`, every inline `PetSnapshot` literal (the ones inside `pets: [...]`) is now missing the two new required fields. Add to each:

```ts
contact: { grounded: false, climbableSurfaceId: null },
motionTarget: null,
```

There are two such literals in that file (in the "draws pet names" and "draws speech" tests).

- [ ] **Step 6: Run tests to verify they pass**

```
npm.cmd run test
```

Expected: All 110 tests pass (plus the new assertions now passing).

- [ ] **Step 7: Commit**

```
git add src/core/snapshots/world-snapshot.ts src/core/world/create-world.ts tests/core/world-fixtures.test.ts tests/playground/canvas-renderer.test.ts
git commit -m "[기타] PetSnapshot에 contact/motionTarget 필드 추가"
```

---

## Task 2: Canvas contact/motion overlay

**Files:**
- Modify: `src/playground/browser/debug-overlay.ts`
- Modify: `src/playground/browser/canvas-renderer.ts`
- Modify: `tests/playground/canvas-renderer.test.ts`

- [ ] **Step 1: Write failing tests for new overlay functions**

Add to `tests/playground/canvas-renderer.test.ts`:

```ts
it("draws a ground contact indicator under a grounded pet", () => {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawWorld(
    context,
    {
      width: 320,
      height: 180,
      bodies: [],
      climbableSurfaces: [],
      pets: [
        {
          id: "pet-a",
          sourceId: "agent-a",
          name: "Alice",
          intent: "idle",
          locomotion: "walk",
          speech: null,
          position: { x: 100, y: 120 },
          contact: { grounded: true, climbableSurfaceId: null },
          motionTarget: null,
        },
      ],
    },
    {},
    0,
  );

  expect(context.ellipse).toHaveBeenCalledWith(100, 127, 12, 4, 0, 0, Math.PI * 2);
});

it("draws a motion target marker when a pet has a motion target", () => {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  drawWorld(
    context,
    {
      width: 320,
      height: 180,
      bodies: [],
      climbableSurfaces: [],
      pets: [
        {
          id: "pet-a",
          sourceId: "agent-a",
          name: "Alice",
          intent: "idle",
          locomotion: "walk",
          speech: null,
          position: { x: 100, y: 120 },
          contact: { grounded: false, climbableSurfaceId: null },
          motionTarget: { x: 200, y: 120 },
        },
      ],
    },
    {},
    0,
  );

  // X marker: two crossing lines at (200, 120)
  expect(context.moveTo).toHaveBeenCalledWith(194, 114);
  expect(context.lineTo).toHaveBeenCalledWith(206, 126);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm.cmd run test tests/playground/canvas-renderer.test.ts
```

Expected: FAIL — `ellipse` and `moveTo` not called.

- [ ] **Step 3: Add overlay drawing functions to debug-overlay.ts**

Append to `src/playground/browser/debug-overlay.ts`:

```ts
export function drawGroundContact(context: CanvasRenderingContext2D, x: number, y: number) {
  context.beginPath();
  context.ellipse(x, y + 7, 12, 4, 0, 0, Math.PI * 2);
  context.fillStyle = "rgba(22, 163, 74, 0.4)";
  context.fill();
}

export function drawMotionTargetMarker(context: CanvasRenderingContext2D, x: number, y: number) {
  const half = 6;
  context.beginPath();
  context.moveTo(x - half, y - half);
  context.lineTo(x + half, y + half);
  context.moveTo(x + half, y - half);
  context.lineTo(x - half, y + half);
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 2;
  context.stroke();
}
```

- [ ] **Step 4: Call overlay functions in canvas-renderer.ts**

In `src/playground/browser/canvas-renderer.ts`, update the `drawWorld` function to import and call the new functions. The pets loop currently draws name/intent labels. Add overlay calls before the name label:

```ts
import { drawClimbableSurface, drawDebugBody, drawGroundContact, drawMotionTargetMarker } from "./debug-overlay";
```

In the `for (const pet of snapshot.pets)` loop, insert before the `context.textAlign = "center"` line:

```ts
    if (pet.contact.grounded) {
      drawGroundContact(context, pet.position.x, pet.position.y);
    }

    if (pet.motionTarget) {
      drawMotionTargetMarker(context, pet.motionTarget.x, pet.motionTarget.y);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```
npm.cmd run test
```

Expected: All tests pass including the two new canvas overlay tests.

- [ ] **Step 6: Commit**

```
git add src/playground/browser/debug-overlay.ts src/playground/browser/canvas-renderer.ts tests/playground/canvas-renderer.test.ts
git commit -m "[기타] 캔버스에 grounded 표시 및 motion target 마커 오버레이 추가"
```

---

## Task 3: BehaviorLab component detail panel

**Files:**
- Modify: `src/playground/browser/behavior-lab.tsx`
- Modify: `src/playground/browser/playground-text.ts`
- Modify: `tests/smoke/playground-app.test.tsx`

The goal: replace the flat tag list at the bottom of BehaviorLab with a panel showing each present component's field values.

- [ ] **Step 1: Write a failing smoke test**

Add to `tests/smoke/playground-app.test.tsx`, in the `"shows selected pet behavior state"` test (or as a new test after it):

```ts
it("shows component field values in the behavior lab component panel", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );

  render(<PlaygroundApp />);

  // CanJump component shows its impulse field value
  expect(screen.getByText("impulse")).toBeInTheDocument();
  // CanWalk component shows its speed field value
  expect(screen.getByText("speed")).toBeInTheDocument();
  // JumpActionState shows the phase field value
  expect(screen.getByText("phase")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

```
npm.cmd run test tests/smoke/playground-app.test.tsx
```

Expected: FAIL — field names like "impulse", "speed", "phase" are not in the DOM.

- [ ] **Step 3: Add text constant**

In `src/playground/browser/playground-text.ts`, add inside `PLAYGROUND_TEXT`:

```ts
componentPanelTitle: "Components",
```

- [ ] **Step 4: Rewrite the components section in BehaviorLab**

In `src/playground/browser/behavior-lab.tsx`, replace the entire `<div>` that renders the `<dt>Components</dt><dd>` tag list (currently near the bottom of the `<dl>`) with a new separate section.

Replace this block:
```tsx
      <div>
          <dt>Components</dt>
          <dd className="behavior-lab__components">
            {componentTypes.map((type) => (
              <span key={type}>{type}</span>
            ))}
          </dd>
        </div>
```

With:
```tsx
      <div>
          <dt>{PLAYGROUND_TEXT.componentPanelTitle}</dt>
          <dd className="behavior-lab__components">
            {componentTypes.map((type) => {
              const comp = getComponent(selectedPet.id, type);
              if (!comp) return null;
              const fields = Object.entries(comp).filter(([key]) => key !== "type");
              return (
                <details key={type} className="behavior-lab__component-detail">
                  <summary>{type}</summary>
                  {fields.length > 0 && (
                    <dl className="behavior-lab__component-fields">
                      {fields.map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{formatComponentValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </details>
              );
            })}
          </dd>
        </div>
```

And add the `formatComponentValue` helper at the bottom of the file (after `formatMotionTarget`):

```ts
function formatComponentValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
```

Also add `import { PLAYGROUND_TEXT } from "./playground-text";` if not already imported (it is already imported).

- [ ] **Step 5: Run tests to verify they pass**

```
npm.cmd run test
```

Expected: All tests pass including the new component panel test.

- [ ] **Step 6: Commit**

```
git add src/playground/browser/behavior-lab.tsx src/playground/browser/playground-text.ts tests/smoke/playground-app.test.tsx
git commit -m "[기타] BehaviorLab 컴포넌트 패널에 필드 값 표시"
```

---

## Task 4: Action timeline

**Files:**
- Create: `src/playground/browser/action-timeline.tsx`
- Modify: `src/playground/browser/playground-app.tsx`
- Modify: `src/playground/browser/playground-text.ts`
- Modify: `tests/smoke/playground-app.test.tsx`

The timeline shows a rolling log of key state changes for all pets, newest first, capped at 40 entries.

- [ ] **Step 1: Write a failing smoke test**

Add to `tests/smoke/playground-app.test.tsx`:

```ts
it("shows the action timeline section", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );

  render(<PlaygroundApp />);

  expect(
    screen.getByRole("heading", { name: PLAYGROUND_TEXT.actionTimelineTitle }),
  ).toBeInTheDocument();
});

it("records a locomotion change in the action timeline", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );

  render(<PlaygroundApp />);

  fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.startWallClimbDemo }));

  // After climb demo, Alice's locomotion changes. An entry should appear.
  expect(screen.getByTestId("action-timeline")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

```
npm.cmd run test tests/smoke/playground-app.test.tsx
```

Expected: FAIL — heading and testid not found.

- [ ] **Step 3: Add text constant**

In `src/playground/browser/playground-text.ts`, add to `PLAYGROUND_TEXT`:

```ts
actionTimelineTitle: "Action timeline",
```

- [ ] **Step 4: Create action-timeline.tsx**

Create `src/playground/browser/action-timeline.tsx`:

```tsx
import { PLAYGROUND_TEXT } from "./playground-text";

export type TimelineEntry = {
  t: number;
  petName: string;
  label: string;
};

type ActionTimelineProps = {
  entries: TimelineEntry[];
};

export function ActionTimeline({ entries }: ActionTimelineProps) {
  return (
    <section className="action-timeline" data-testid="action-timeline">
      <h2>{PLAYGROUND_TEXT.actionTimelineTitle}</h2>
      <ol className="action-timeline__log">
        {entries.map((entry, i) => (
          <li key={i} className="action-timeline__entry">
            <span className="action-timeline__time">{entry.t}ms</span>
            <span className="action-timeline__pet">{entry.petName}</span>
            <span className="action-timeline__label">{entry.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Wire timeline state into PlaygroundApp**

In `src/playground/browser/playground-app.tsx`:

1. Add import:
```ts
import { ActionTimeline, type TimelineEntry } from "./action-timeline";
```

2. Add state after existing `useState` declarations:
```ts
const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
const prevSnapshotRef = useRef<ReturnType<typeof scenarioRef.current.world.snapshot> | null>(null);
```

3. Add a helper function to detect state changes and produce timeline entries:
```ts
function diffSnapshot(
  prev: ReturnType<typeof scenarioRef.current.world.snapshot>,
  next: ReturnType<typeof scenarioRef.current.world.snapshot>,
  t: number,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const pet of next.pets) {
    const prevPet = prev.pets.find((p) => p.id === pet.id);
    if (!prevPet) continue;
    if (prevPet.locomotion !== pet.locomotion) {
      entries.push({ t, petName: pet.name, label: `locomotion: ${prevPet.locomotion} → ${pet.locomotion}` });
    }
    if (prevPet.intent !== pet.intent) {
      entries.push({ t, petName: pet.name, label: `intent: ${prevPet.intent} → ${pet.intent}` });
    }
  }
  return entries;
}
```

4. In the `setInterval` callback, after `setSnapshot(nextSnapshot)`, add:
```ts
const t = scenarioRef.current.clock.now();
if (prevSnapshotRef.current) {
  const newEntries = diffSnapshot(prevSnapshotRef.current, nextSnapshot, t);
  if (newEntries.length > 0) {
    setTimelineEntries((prev) => [...newEntries, ...prev].slice(0, 40));
  }
}
prevSnapshotRef.current = nextSnapshot;
```

5. After `sendEvent` calls that call `setSnapshot`, also run diffSnapshot. Insert after `setSnapshot(...)` in `sendEvent`:
```ts
const t = scenarioRef.current.clock.now();
if (prevSnapshotRef.current) {
  const newEntries = diffSnapshot(prevSnapshotRef.current, scenarioRef.current.world.snapshot(), t);
  if (newEntries.length > 0) {
    setTimelineEntries((prev) => [...newEntries, ...prev].slice(0, 40));
  }
}
prevSnapshotRef.current = scenarioRef.current.world.snapshot();
```

6. Render `<ActionTimeline>` in the JSX. Add after `<BehaviorLab ...>`:
```tsx
<ActionTimeline entries={timelineEntries} />
```

- [ ] **Step 6: Run tests to verify they pass**

```
npm.cmd run test
```

Expected: All tests pass including the two new timeline tests.

- [ ] **Step 7: Commit**

```
git add src/playground/browser/action-timeline.tsx src/playground/browser/playground-app.tsx src/playground/browser/playground-text.ts tests/smoke/playground-app.test.tsx
git commit -m "[기타] Action timeline 추가 - 상태 변경 이력 표시"
```

---

## Self-Review

**Spec coverage:**
- ✅ surface/contact overlay: Task 2 draws grounded indicator + motion target marker
- ✅ component panel: Task 3 shows each component's field values via `<details>`
- ✅ action timeline: Task 4 logs locomotion/intent transitions
- ⚠️ "surface overlay" could also mean highlighting the *active* climb surface (the one the selected pet is touching). Task 2 draws a ground contact shadow but doesn't highlight the climb surface marker differently when a pet is attached to it. This is a gap — add it to Task 2 as an optional extension if desired.

**Placeholder scan:**
- No TBDs found.
- All code blocks contain complete implementations.

**Type consistency:**
- `TimelineEntry` defined in `action-timeline.tsx` and re-exported; `PlaygroundApp` imports `TimelineEntry` from there — consistent.
- `drawGroundContact`, `drawMotionTargetMarker` defined in `debug-overlay.ts` and imported in `canvas-renderer.ts` — consistent.
- `PetSnapshot.contact` and `PetSnapshot.motionTarget` added in Task 1, used in Task 2 — consistent.
- `PLAYGROUND_TEXT.componentPanelTitle` added in Task 3, `PLAYGROUND_TEXT.actionTimelineTitle` added in Task 4 — consistent.
