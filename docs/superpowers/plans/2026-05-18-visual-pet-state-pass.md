# Visual Pet State Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pet state visibly legible in the browser playground by enriching `WorldSnapshot`, drawing labels and speech on the canvas, and adding a compact status list driven from the same snapshot.

**Architecture:** Extend the render-facing snapshot contract with pet state, keep fixture names in the demo scenario, and make both canvas and status list consume the same snapshot instead of reaching into runtime internals independently. Keep the slice focused on observability rather than deeper AI behavior.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Playwright, Vite

---

## File Map

```text
src/
  core/
    snapshots/
      world-snapshot.ts
    world/
      create-world.ts
      scenario-fixtures.ts
  playground/
    browser/
      canvas-renderer.ts
      pet-status-list.tsx
      playground-app.tsx
      playground-text.ts
  styles.css
tests/
  core/
    world-fixtures.test.ts
  playground/
    canvas-renderer.test.ts
  smoke/
    playground-app.test.tsx
e2e/
  pages/
    playground.page.ts
  playground.spec.ts
```

### Task 1: Enrich world snapshots with pet render state

**Files:**
- Modify: `src/core/snapshots/world-snapshot.ts`
- Modify: `src/core/world/create-world.ts`
- Modify: `src/core/world/scenario-fixtures.ts`
- Test: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Write failing snapshot tests**

```ts
it("includes fixture pet render state in the snapshot", () => {
  const scenario = createDemoScenario();
  const snapshot = scenario.world.snapshot();

  expect(snapshot.pets.map((pet) => pet.name)).toEqual(["Alice", "Bob", "Charlie"]);
  expect(snapshot.pets[0]).toMatchObject({
    id: "pet-a",
    sourceId: "agent-a",
    name: "Alice",
    intent: "idle",
    speech: null,
  });
});

it("aligns pet snapshot positions with their body positions", () => {
  const scenario = createDemoScenario();
  const snapshot = scenario.world.snapshot();

  expect(snapshot.pets[0].position).toEqual({
    x: snapshot.bodies[0].x,
    y: snapshot.bodies[0].y,
  });
});
```

- [ ] **Step 2: Run the focused snapshot tests to verify RED**

Run: `npm.cmd test -- tests/core/world-fixtures.test.ts`

Expected: FAIL because `snapshot.pets` does not exist yet.

- [ ] **Step 3: Extend the snapshot model**

```ts
// src/core/snapshots/world-snapshot.ts
export type BodySnapshot = {
  id: string;
  x: number;
  y: number;
};

export type PetSnapshot = {
  id: string;
  sourceId: string;
  name: string;
  intent: string;
  speech: string | null;
  position: {
    x: number;
    y: number;
  };
};

export type WorldSnapshot = {
  bodies: BodySnapshot[];
  pets: PetSnapshot[];
};
```

- [ ] **Step 4: Add fixture names and emit pet snapshots**

```ts
// src/core/world/create-world.ts
export type RuntimePet = {
  id: string;
  sourceId: string;
  name: string;
  components: {
    Talkative?: { type: "Talkative"; idleAfterMs: number };
  };
  runtime: {
    lastActiveAt: number;
    speech: string | null;
    intent: string;
  };
};
```

```ts
snapshot() {
  const physicsSnapshot = physics.snapshot();
  const bodiesById = new Map(physicsSnapshot.bodies.map((body) => [body.id, body]));

  return {
    ...physicsSnapshot,
    pets: input.pets.map((pet) => {
      const body = bodiesById.get(pet.id);
      return {
        id: pet.id,
        sourceId: pet.sourceId,
        name: pet.name,
        intent: pet.runtime.intent,
        speech: pet.runtime.speech,
        position: {
          x: body?.x ?? 0,
          y: body?.y ?? 0,
        },
      };
    }),
  };
}
```

```ts
// src/core/world/scenario-fixtures.ts
{
  id: "pet-a",
  sourceId: "agent-a",
  name: "Alice",
  ...
}
{
  id: "pet-b",
  sourceId: "agent-b",
  name: "Bob",
  ...
}
{
  id: "pet-c",
  sourceId: "agent-c",
  name: "Charlie",
  ...
}
```

- [ ] **Step 5: Run the focused snapshot tests to verify GREEN**

Run: `npm.cmd test -- tests/core/world-fixtures.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/snapshots/world-snapshot.ts src/core/world/create-world.ts src/core/world/scenario-fixtures.ts tests/core/world-fixtures.test.ts
git commit -m "feat: include pet render state in snapshots"
```

### Task 2: Draw pet labels and speech on the canvas

**Files:**
- Modify: `src/playground/browser/canvas-renderer.ts`
- Test: `tests/playground/canvas-renderer.test.ts`

- [ ] **Step 1: Extend renderer tests**

```ts
it("draws pet names and intents from the world snapshot", () => {
  const context = createContext();

  drawWorld(
    context,
    {
      bodies: [{ id: "pet-a", x: 100, y: 120 }],
      pets: [
        {
          id: "pet-a",
          sourceId: "agent-a",
          name: "Alice",
          intent: "seek-user",
          speech: null,
          position: { x: 100, y: 120 },
        },
      ],
    },
    {},
    0,
  );

  expect(context.fillText).toHaveBeenCalledWith("Alice", 100, 88);
  expect(context.fillText).toHaveBeenCalledWith("seek-user", 100, 104);
});

it("draws speech when a pet has speech", () => {
  const context = createContext();

  drawWorld(
    context,
    {
      bodies: [{ id: "pet-a", x: 100, y: 120 }],
      pets: [
        {
          id: "pet-a",
          sourceId: "agent-a",
          name: "Alice",
          intent: "seek-user",
          speech: "Needs approval",
          position: { x: 100, y: 120 },
        },
      ],
    },
    {},
    0,
  );

  expect(context.fillText).toHaveBeenCalledWith("Needs approval", 100, 72);
});
```

- [ ] **Step 2: Run renderer tests to verify RED**

Run: `npm.cmd test -- tests/playground/canvas-renderer.test.ts`

Expected: FAIL because labels are not drawn yet.

- [ ] **Step 3: Implement compact label and speech rendering**

```ts
for (const pet of snapshot.pets) {
  context.textAlign = "center";
  context.fillStyle = "#172033";
  context.font = "12px Inter, Arial, sans-serif";
  context.fillText(pet.name, pet.position.x, pet.position.y - 32);
  context.fillStyle = "#526074";
  context.fillText(pet.intent, pet.position.x, pet.position.y - 16);

  if (pet.speech) {
    context.fillStyle = "#ffffff";
    context.fillRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
    context.strokeStyle = "#ccd5e0";
    context.strokeRect(pet.position.x - 54, pet.position.y - 64, 108, 20);
    context.fillStyle = "#172033";
    context.fillText(pet.speech, pet.position.x, pet.position.y - 48);
  }
}
```

If the current fake canvas context in tests lacks these APIs, extend the test helper with `fillText`, `fillRect`, and `strokeRect` spies before making assertions.

- [ ] **Step 4: Run renderer tests to verify GREEN**

Run: `npm.cmd test -- tests/playground/canvas-renderer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/playground/browser/canvas-renderer.ts tests/playground/canvas-renderer.test.ts
git commit -m "feat: render pet labels on canvas"
```

### Task 3: Add the snapshot-driven status list

**Files:**
- Create: `src/playground/browser/pet-status-list.tsx`
- Modify: `src/playground/browser/playground-app.tsx`
- Modify: `src/playground/browser/playground-text.ts`
- Modify: `src/styles.css`
- Test: `tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Extend component tests**

```tsx
it("renders pet status from the world snapshot", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );

  render(<PlaygroundApp />);

  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("Bob")).toBeInTheDocument();
  expect(screen.getByText("Charlie")).toBeInTheDocument();
});

it("updates visible pet status after a waiting event", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );

  render(<PlaygroundApp />);

  fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }));

  expect(screen.getByText("seek-user")).toBeInTheDocument();
  expect(screen.getByText("Needs approval")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the playground test to verify RED**

Run: `npm.cmd test -- tests/smoke/playground-app.test.tsx`

Expected: FAIL because the status list does not exist and the playground does not retain the latest snapshot in React state.

- [ ] **Step 3: Add status list labels and component**

```ts
// src/playground/browser/playground-text.ts
export const PLAYGROUND_TEXT = {
  ...
  petStatusTitle: "Pet status",
  noSpeech: "No speech",
} as const;
```

```tsx
// src/playground/browser/pet-status-list.tsx
import type { PetSnapshot } from "@/core/snapshots/world-snapshot";
import { PLAYGROUND_TEXT } from "./playground-text";

type PetStatusListProps = {
  pets: PetSnapshot[];
};

export function PetStatusList({ pets }: PetStatusListProps) {
  return (
    <section className="pet-status-list">
      <h2>{PLAYGROUND_TEXT.petStatusTitle}</h2>
      <ul>
        {pets.map((pet) => (
          <li key={pet.id}>
            <strong>{pet.name}</strong>
            <span>{pet.sourceId}</span>
            <span>{pet.intent}</span>
            <span>{pet.speech ?? PLAYGROUND_TEXT.noSpeech}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Keep the latest snapshot in playground state**

```tsx
const [snapshot, setSnapshot] = useState(() => scenarioRef.current.world.snapshot());
```

Inside the render loop:

```tsx
const nextSnapshot = scenarioRef.current.world.snapshot();
setSnapshot(nextSnapshot);
drawWorld(context, nextSnapshot, {}, scenarioRef.current.clock.now());
```

Inside `sendEvent` after pushing the stimulus:

```tsx
scenarioRef.current.world.step(0);
setSnapshot(scenarioRef.current.world.snapshot());
```

Render the status list from `snapshot.pets`.

- [ ] **Step 5: Add restrained list styling**

```css
.pet-status-list h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.pet-status-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.pet-status-list li {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) minmax(88px, 1fr) minmax(88px, 1fr) minmax(120px, 2fr);
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #ccd5e0;
  border-radius: 8px;
  background: #ffffff;
}
```

- [ ] **Step 6: Run the playground test to verify GREEN**

Run: `npm.cmd test -- tests/smoke/playground-app.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/playground/browser src/styles.css tests/smoke/playground-app.test.tsx
git commit -m "feat: add snapshot-driven pet status list"
```

### Task 4: Extend POM-based e2e coverage

**Files:**
- Modify: `e2e/pages/playground.page.ts`
- Modify: `e2e/playground.spec.ts`

- [ ] **Step 1: Extend the e2e spec**

```ts
test("waiting events update visible pet status", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();
  await playground.sendWaitingEvent();
  await playground.expectPetStatus("Alice", "seek-user", "Needs approval");
});
```

- [ ] **Step 2: Run e2e listing to verify RED**

Run: `npm.cmd run test:e2e -- --list`

Expected: PASS for discovery, but the suite will fail at runtime because the page object lacks `expectPetStatus`.

- [ ] **Step 3: Extend the page object**

```ts
async expectPetStatus(name: string, intent: string, speech: string) {
  await expect(this.page.getByText(name, { exact: true })).toBeVisible();
  await expect(this.page.getByText(intent, { exact: true })).toBeVisible();
  await expect(this.page.getByText(speech, { exact: true })).toBeVisible();
}
```

- [ ] **Step 4: Run the e2e suite to verify GREEN**

Run: `npm.cmd run test:e2e`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/playground.page.ts e2e/playground.spec.ts
git commit -m "test: verify visible pet status updates"
```

### Task 5: Final verification

**Files:**
- No source changes expected

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 3: Run the Playwright suite**

Run: `npm.cmd run test:e2e`

Expected: PASS.

- [ ] **Step 4: Visually verify the browser playground**

Open the running local playground, trigger a waiting event, and confirm:

- fixture names `Alice`, `Bob`, `Charlie`
- Alice changes to `seek-user`
- `Needs approval` appears in the status list
- canvas labels and speech remain readable

- [ ] **Step 5: Commit only if final touch-up changes were needed**

If no final touch-ups are needed, do not create an empty commit.
