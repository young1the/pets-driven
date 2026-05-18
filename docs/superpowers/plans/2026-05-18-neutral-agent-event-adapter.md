# Neutral Agent Event Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-agnostic neutral agent-event adapter, make all three task lifecycle events visible in the simulation, and expose sample event injection plus last-event JSON in the browser playground.

**Architecture:** Introduce a focused `AgentEvent` boundary under `src/adapters/agent-events`, map neutral events into existing core stimuli, keep the core provider-agnostic, and extend the playground to exercise that adapter instead of constructing stimuli inline. Keep changes narrow: no Claude-specific parsing, no transport layer, and no generic event bus.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Matter.js, Playwright, Vite

---

## File Map

```text
src/
  adapters/
    agent-events/
      agent-event.ts              # validated neutral event contract
      agent-event-adapter.ts      # AgentEvent -> Stimulus mapping
  core/
    stimuli/
      stimulus.ts                 # extend stimulus vocabulary
    systems/
      stimulus-reaction-system.ts # react to started/waiting/completed
  playground/
    browser/
      agent-event-panel.tsx       # read-only JSON panel
      playground-app.tsx          # inject neutral events through adapter
      playground-text.ts          # shared UI labels
      scenario-controls.tsx       # three sample event controls
tests/
  adapters/
    agent-event-adapter.test.ts
  core/
    systems.test.ts
  smoke/
    playground-app.test.tsx
e2e/
  pages/
    playground.page.ts
  playground.spec.ts
```

### Task 1: Add the neutral agent-event contract and adapter

**Files:**
- Create: `src/adapters/agent-events/agent-event.ts`
- Create: `src/adapters/agent-events/agent-event-adapter.ts`
- Modify: `src/core/stimuli/stimulus.ts`
- Test: `tests/adapters/agent-event-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter tests**

```ts
import { describe, expect, it } from "vitest";
import { createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toStimulus } from "@/adapters/agent-events/agent-event-adapter";

describe("agent event adapter", () => {
  it.each(["task.started", "task.waiting", "task.completed"] as const)(
    "maps %s into the matching stimulus",
    (type) => {
      const event = createAgentEvent({
        type,
        sourceId: "agent-a",
        at: 10,
        summary: "Lifecycle update",
      });

      expect(toStimulus(event)).toEqual({
        type,
        sourceId: "agent-a",
        at: 10,
        summary: "Lifecycle update",
      });
    },
  );

  it("rejects unsupported task event types", () => {
    expect(() =>
      createAgentEvent({
        type: "task.paused",
        sourceId: "agent-a",
        at: 10,
      }),
    ).toThrow("Unsupported agent event type: task.paused");
  });
});
```

- [ ] **Step 2: Run the adapter test to verify RED**

Run: `npm.cmd test -- tests/adapters/agent-event-adapter.test.ts`

Expected: FAIL because the adapter files do not exist yet.

- [ ] **Step 3: Extend the stimulus type and implement the neutral event contract**

```ts
// src/core/stimuli/stimulus.ts
export type Stimulus =
  | {
      type: "task.started";
      sourceId: string;
      at: number;
      summary?: string;
    }
  | {
      type: "task.waiting";
      sourceId: string;
      at: number;
      summary?: string;
    }
  | {
      type: "task.completed";
      sourceId: string;
      at: number;
      summary?: string;
    }
  | {
      type: "attention.requested";
      sourceId: string;
      at: number;
      summary?: string;
    };
```

```ts
// src/adapters/agent-events/agent-event.ts
export type AgentEventType = "task.started" | "task.waiting" | "task.completed";

export type AgentEvent = {
  type: AgentEventType;
  sourceId: string;
  at: number;
  summary?: string;
};

type AgentEventInput = {
  type: string;
  sourceId: string;
  at: number;
  summary?: string;
};

const AGENT_EVENT_TYPES = new Set<AgentEventType>([
  "task.started",
  "task.waiting",
  "task.completed",
]);

export function createAgentEvent(input: AgentEventInput): AgentEvent {
  if (!AGENT_EVENT_TYPES.has(input.type as AgentEventType)) {
    throw new Error(`Unsupported agent event type: ${input.type}`);
  }

  return input as AgentEvent;
}
```

```ts
// src/adapters/agent-events/agent-event-adapter.ts
import type { Stimulus } from "@/core/stimuli/stimulus";
import type { AgentEvent } from "./agent-event";

export function toStimulus(event: AgentEvent): Stimulus {
  return {
    type: event.type,
    sourceId: event.sourceId,
    at: event.at,
    summary: event.summary,
  };
}
```

- [ ] **Step 4: Run the adapter test to verify GREEN**

Run: `npm.cmd test -- tests/adapters/agent-event-adapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters src/core/stimuli/stimulus.ts tests/adapters/agent-event-adapter.test.ts
git commit -m "feat: add neutral agent event adapter"
```

### Task 2: Make started and completed stimuli visible in the world

**Files:**
- Modify: `src/core/systems/stimulus-reaction-system.ts`
- Modify: `src/core/world/create-world.ts`
- Test: `tests/core/systems.test.ts`
- Test: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Extend the failing system tests**

```ts
it("turns started stimuli into active pets", () => {
  const pet = {
    id: "pet-a",
    sourceId: "agent-a",
    runtime: {
      lastActiveAt: 0,
      intent: "idle",
      speech: "Old message" as string | null,
    },
  };

  runStimulusReactionSystem([pet], [
    { type: "task.started", sourceId: "agent-a", at: 10, summary: "Working" },
  ]);

  expect(pet.runtime.intent).toBe("active");
  expect(pet.runtime.speech).toBeNull();
  expect(pet.runtime.lastActiveAt).toBe(10);
});

it("turns completed stimuli into idle pets with a summary", () => {
  const pet = {
    id: "pet-a",
    sourceId: "agent-a",
    runtime: {
      lastActiveAt: 0,
      intent: "seek-user",
      speech: null as string | null,
    },
  };

  runStimulusReactionSystem([pet], [
    { type: "task.completed", sourceId: "agent-a", at: 20, summary: "Done" },
  ]);

  expect(pet.runtime.intent).toBe("idle");
  expect(pet.runtime.speech).toBe("Done");
  expect(pet.runtime.lastActiveAt).toBe(20);
});
```

```ts
it("reacts to a started then completed task lifecycle", () => {
  const scenario = createDemoScenario();

  scenario.world.pushStimulus({
    type: "task.started",
    sourceId: "agent-a",
    at: 10,
    summary: "Working",
  });
  scenario.world.step(16);

  expect(scenario.world.pets[0].runtime.intent).toBe("active");

  scenario.world.pushStimulus({
    type: "task.completed",
    sourceId: "agent-a",
    at: 20,
    summary: "Done",
  });
  scenario.world.step(16);

  expect(scenario.world.pets[0].runtime.intent).toBe("idle");
  expect(scenario.world.pets[0].runtime.speech).toBe("Done");
});
```

- [ ] **Step 2: Run focused core tests to verify RED**

Run:

```bash
npm.cmd test -- tests/core/systems.test.ts
npm.cmd test -- tests/core/world-fixtures.test.ts
```

Expected: FAIL because started and completed stimuli are not handled yet.

- [ ] **Step 3: Implement minimal lifecycle reactions**

```ts
// src/core/systems/stimulus-reaction-system.ts
import type { Stimulus } from "@/core/stimuli/stimulus";

type StimulusReactivePet = {
  id: string;
  sourceId: string;
  runtime: {
    lastActiveAt?: number;
    intent: string;
    speech: string | null;
  };
};

export function runStimulusReactionSystem(
  pets: StimulusReactivePet[],
  stimuli: Stimulus[],
) {
  for (const stimulus of stimuli) {
    const pet = pets.find((candidate) => candidate.sourceId === stimulus.sourceId);
    if (!pet) {
      continue;
    }

    if (stimulus.type === "task.started") {
      pet.runtime.intent = "active";
      pet.runtime.speech = null;
      pet.runtime.lastActiveAt = stimulus.at;
    }

    if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
      pet.runtime.intent = "seek-user";
      pet.runtime.speech = stimulus.summary ?? "I need you.";
    }

    if (stimulus.type === "task.completed") {
      pet.runtime.intent = "idle";
      pet.runtime.speech = stimulus.summary ?? null;
      pet.runtime.lastActiveAt = stimulus.at;
    }
  }
}
```

If `create-world.ts` does not expose `pets` yet, extend the returned world object with a readonly `pets` field that references the existing pet array so the behavior test can assert visible runtime changes without reaching into private internals.

- [ ] **Step 4: Run focused core tests to verify GREEN**

Run:

```bash
npm.cmd test -- tests/core/systems.test.ts
npm.cmd test -- tests/core/world-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/systems/stimulus-reaction-system.ts src/core/world/create-world.ts tests/core/systems.test.ts tests/core/world-fixtures.test.ts
git commit -m "feat: react to task lifecycle stimuli"
```

### Task 3: Extend the playground with neutral sample events

**Files:**
- Create: `src/playground/browser/agent-event-panel.tsx`
- Modify: `src/playground/browser/playground-app.tsx`
- Modify: `src/playground/browser/playground-text.ts`
- Modify: `src/playground/browser/scenario-controls.tsx`
- Test: `tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Extend the failing playground component tests**

```tsx
it("injects neutral task lifecycle events and shows the last payload", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );

  render(<PlaygroundApp />);

  fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendStartedEvent }));
  expect(screen.getByText(/"type": "task.started"/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }));
  expect(screen.getByText(/"type": "task.waiting"/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: PLAYGROUND_TEXT.sendCompletedEvent }));
  expect(screen.getByText(/"type": "task.completed"/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the playground component test to verify RED**

Run: `npm.cmd test -- tests/smoke/playground-app.test.tsx`

Expected: FAIL because the new controls and payload panel do not exist yet.

- [ ] **Step 3: Add playground labels and components**

```ts
// src/playground/browser/playground-text.ts
export const PLAYGROUND_TEXT = {
  title: "pets-driven playground",
  sendStartedEvent: "Send started event",
  sendWaitingEvent: "Send waiting event",
  sendCompletedEvent: "Send completed event",
  lastStimulusPrefix: "Last stimulus:",
  lastEventTitle: "Last event",
} as const;
```

```tsx
// src/playground/browser/scenario-controls.tsx
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

type ScenarioControlsProps = {
  lastStimulus: string;
  onSendStarted(): void;
  onSendWaiting(): void;
  onSendCompleted(): void;
};

export function ScenarioControls({
  lastStimulus,
  onSendStarted,
  onSendWaiting,
  onSendCompleted,
}: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
      <button type="button" onClick={onSendStarted}>
        {PLAYGROUND_TEXT.sendStartedEvent}
      </button>
      <button type="button" onClick={onSendWaiting}>
        {PLAYGROUND_TEXT.sendWaitingEvent}
      </button>
      <button type="button" onClick={onSendCompleted}>
        {PLAYGROUND_TEXT.sendCompletedEvent}
      </button>
      <p>
        {PLAYGROUND_TEXT.lastStimulusPrefix} {lastStimulus}
      </p>
    </section>
  );
}
```

```tsx
// src/playground/browser/agent-event-panel.tsx
import type { AgentEvent } from "@/adapters/agent-events/agent-event";
import { PLAYGROUND_TEXT } from "./playground-text";

type AgentEventPanelProps = {
  event: AgentEvent | null;
};

export function AgentEventPanel({ event }: AgentEventPanelProps) {
  return (
    <section className="agent-event-panel">
      <h2>{PLAYGROUND_TEXT.lastEventTitle}</h2>
      <pre>{event ? JSON.stringify(event, null, 2) : "{}"}</pre>
    </section>
  );
}
```

- [ ] **Step 4: Route playground events through the neutral adapter**

```tsx
// src/playground/browser/playground-app.tsx
import { createAgentEvent, type AgentEvent } from "@/adapters/agent-events/agent-event";
import { toStimulus } from "@/adapters/agent-events/agent-event-adapter";
import { createDemoScenario } from "@/core/world/scenario-fixtures";
import { useEffect, useRef, useState } from "react";
import { AgentEventPanel } from "./agent-event-panel";
import { drawWorld } from "./canvas-renderer";
import { PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);

  function sendEvent(type: AgentEvent["type"], summary: string) {
    const event = createAgentEvent({
      type,
      sourceId: "agent-a",
      at: scenarioRef.current.clock.now(),
      summary,
    });

    scenarioRef.current.world.pushStimulus(toStimulus(event));
    setLastStimulus(type);
    setLastEvent(event);
  }

  return (
    <main className="playground-shell">
      <header>
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
      <ScenarioControls
        lastStimulus={lastStimulus}
        onSendStarted={() => sendEvent("task.started", "Working")}
        onSendWaiting={() => sendEvent("task.waiting", "Needs approval")}
        onSendCompleted={() => sendEvent("task.completed", "Done")}
      />
      <AgentEventPanel event={lastEvent} />
      <canvas ref={canvasRef} data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
```

Preserve the existing `useEffect` render loop from the current file when applying this change.

- [ ] **Step 5: Run the playground component test to verify GREEN**

Run: `npm.cmd test -- tests/smoke/playground-app.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/playground/browser tests/smoke/playground-app.test.tsx
git commit -m "feat: inject neutral events from playground"
```

### Task 4: Extend the POM-based end-to-end flow

**Files:**
- Modify: `e2e/pages/playground.page.ts`
- Modify: `e2e/playground.spec.ts`

- [ ] **Step 1: Rewrite the e2e spec around all three sample events**

```ts
import { test } from "@playwright/test";
import { PlaygroundPage } from "./pages/playground.page";

test("playground injects task lifecycle events", async ({ page }) => {
  const playground = new PlaygroundPage(page);

  await playground.goto();
  await playground.expectReady();

  await playground.sendStartedEvent();
  await playground.expectLastEventType("task.started");

  await playground.sendWaitingEvent();
  await playground.expectLastEventType("task.waiting");

  await playground.sendCompletedEvent();
  await playground.expectLastEventType("task.completed");
});
```

- [ ] **Step 2: Run e2e listing to verify RED**

Run: `npm.cmd run test:e2e -- --list`

Expected: FAIL because the page object does not yet expose the new methods.

- [ ] **Step 3: Extend the page object**

```ts
import { expect, type Page } from "@playwright/test";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

export class PlaygroundPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
  }

  async expectReady() {
    await expect(
      this.page.getByRole("heading", { name: PLAYGROUND_TEXT.title }),
    ).toBeVisible();
    await expect(this.page.getByTestId("world-canvas")).toBeVisible();
  }

  async sendStartedEvent() {
    await this.page.getByRole("button", { name: PLAYGROUND_TEXT.sendStartedEvent }).click();
  }

  async sendWaitingEvent() {
    await this.page.getByRole("button", { name: PLAYGROUND_TEXT.sendWaitingEvent }).click();
  }

  async sendCompletedEvent() {
    await this.page.getByRole("button", { name: PLAYGROUND_TEXT.sendCompletedEvent }).click();
  }

  async expectLastEventType(type: string) {
    await expect(this.page.getByText(new RegExp(`"type": "${type}"`))).toBeVisible();
  }
}
```

- [ ] **Step 4: Run the e2e suite to verify GREEN**

Run: `npm.cmd run test:e2e`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/playground.page.ts e2e/playground.spec.ts
git commit -m "test: cover neutral event playground flow"
```

### Task 5: Run the final verification suite

**Files:**
- No source changes expected

- [ ] **Step 1: Run the full unit and component test suite**

Run: `npm.cmd test`

Expected: PASS with all tests green.

- [ ] **Step 2: Run the production build**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 3: Run the Playwright suite**

Run: `npm.cmd run test:e2e`

Expected: PASS.

- [ ] **Step 4: Confirm provider-specific work remains out of scope**

Run:

```bash
rg -n "ClaudeHook|PostToolUse|PreToolUse|Notification" src tests e2e
```

Expected: no matches.

- [ ] **Step 5: Commit any final documentation-only corrections if needed**

If no corrections are needed, do not create an empty commit.
