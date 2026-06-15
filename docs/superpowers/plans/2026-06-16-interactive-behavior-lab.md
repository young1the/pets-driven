# Interactive Behavior Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive Behavior Lab first slice that injects real agent stimuli into the playground simulation and explains the selected pet's behavior pipeline.

**Architecture:** Keep the production simulation as the only behavior engine. Add a small event adapter for agent stimuli and a small explanation adapter that reads selected pet snapshots/components, then update the existing `BehaviorLab` UI to render stimulus buttons, pipeline steps, a trace, and the current component inspector.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, existing `@pets-driven/design-system` components, existing ECS/world event modules.

---

## File Structure

- Create `apps/desktop/src/playground/browser/behavior-lab-events.ts`
  - Owns Behavior Lab stimulus types and conversion from a UI stimulus to a real `AgentWorldEvent`.
- Create `apps/desktop/tests/playground/behavior-lab-events.test.ts`
  - Unit tests for agent stimulus conversion and missing binding handling.
- Create `apps/desktop/src/playground/browser/behavior-lab-explanation.ts`
  - Owns the readable pipeline model derived from selected pet snapshot plus ECS components.
- Create `apps/desktop/tests/playground/behavior-lab-explanation.test.ts`
  - Unit tests for idle, held agent state, decision token, planning, and presentation explanations.
- Modify `apps/desktop/src/playground/browser/behavior-lab.tsx`
  - Renders stimulus groups, pipeline steps, trace rows, and keeps the raw component inspector under the existing show/hide control.
- Modify `apps/desktop/src/playground/browser/playground-app.tsx`
  - Passes an agent-stimulus handler and current clock time into `BehaviorLab`; the handler pushes the generated world event and advances one frame.
- Modify `apps/desktop/src/playground/browser/playground-text.ts`
  - Adds stable English UI strings used by tests.
- Modify `apps/desktop/src/styles/playground.css`
  - Adds layout styles using the existing design-system tokens only.
- Modify `apps/desktop/tests/smoke/playground-app.test.tsx`
  - Adds integration coverage for clicking a Behavior Lab stimulus and seeing pipeline/trace output.

---

### Task 1: Add Agent Stimulus Event Adapter

**Files:**
- Create: `apps/desktop/src/playground/browser/behavior-lab-events.ts`
- Test: `apps/desktop/tests/playground/behavior-lab-events.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/tests/playground/behavior-lab-events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ComponentOf, ComponentType } from "@/core/components";
import type { PetSnapshot } from "@/core/world-snapshot";
import {
  AGENT_STIMULUS_OPTIONS,
  createAgentStimulusEvent,
  type BehaviorLabAgentStimulusType,
} from "@/playground/browser/behavior-lab-events";

function pet(overrides: Partial<PetSnapshot> = {}): PetSnapshot {
  return {
    id: "pet-a",
    sourceId: "agent-a",
    name: "Alice",
    intent: "idle",
    locomotion: "walking",
    speech: null,
    position: { x: 100, y: 200 },
    contact: { grounded: true, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    heldAgentState: null,
    visualCue: null,
    ...overrides,
  };
}

function componentReader(agentSourceId: string | undefined) {
  return <TType extends ComponentType>(
    id: string,
    type: TType,
  ): ComponentOf<TType> | undefined => {
    if (id !== "pet-a" || type !== "AgentBinding" || !agentSourceId) {
      return undefined;
    }

    return {
      type: "AgentBinding",
      sourceId: agentSourceId,
    } as ComponentOf<TType>;
  };
}

describe("behavior lab event adapter", () => {
  it("lists the first-slice agent stimuli in display order", () => {
    expect(AGENT_STIMULUS_OPTIONS.map((option) => option.type)).toEqual([
      "task.started",
      "task.waiting",
      "attention.requested",
      "task.completed",
      "task.failed",
    ]);
  });

  it("creates a real agent world event for the selected pet binding", () => {
    const result = createAgentStimulusEvent({
      type: "task.completed",
      pet: pet(),
      getComponent: componentReader("agent-a"),
      now: 128,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toEqual({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 128,
      summary: "Behavior Lab injected task.completed for Alice",
    });
    expect(result.trace).toEqual({
      id: "agent-task.completed-128",
      channel: "agent",
      label: "Completed",
      type: "task.completed",
      at: 128,
      petName: "Alice",
    });
  });

  it("returns a readable error when the selected pet has no agent binding", () => {
    const result = createAgentStimulusEvent({
      type: "task.failed" as BehaviorLabAgentStimulusType,
      pet: pet(),
      getComponent: componentReader(undefined),
      now: 256,
    });

    expect(result).toEqual({
      ok: false,
      message: "Alice has no AgentBinding, so agent stimuli cannot be routed.",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter pets-driven test -- tests/playground/behavior-lab-events.test.ts
```

Expected: FAIL because `behavior-lab-events.ts` does not exist.

- [ ] **Step 3: Add the adapter implementation**

Create `apps/desktop/src/playground/browser/behavior-lab-events.ts`:

```ts
import type { ComponentOf, ComponentType } from "@/core/components";
import type { PetSnapshot } from "@/core/world-snapshot";
import type { AgentWorldEvent } from "@/features/events/world-event";

export type BehaviorLabAgentStimulusType = AgentWorldEvent["type"];

export type BehaviorLabStimulusChannel = "agent";

export type BehaviorLabStimulusTrace = {
  id: string;
  channel: BehaviorLabStimulusChannel;
  label: string;
  type: BehaviorLabAgentStimulusType;
  at: number;
  petName: string;
};

export type BehaviorLabEventResult =
  | {
      ok: true;
      event: AgentWorldEvent;
      trace: BehaviorLabStimulusTrace;
    }
  | {
      ok: false;
      message: string;
    };

export type BehaviorLabComponentReader = <TType extends ComponentType>(
  id: string,
  type: TType,
) => ComponentOf<TType> | undefined;

export const AGENT_STIMULUS_OPTIONS: Array<{
  type: BehaviorLabAgentStimulusType;
  label: string;
  summary: string;
}> = [
  {
    type: "task.started",
    label: "Started",
    summary: "Behavior Lab injected task.started",
  },
  {
    type: "task.waiting",
    label: "Waiting",
    summary: "Behavior Lab injected task.waiting",
  },
  {
    type: "attention.requested",
    label: "Attention",
    summary: "Behavior Lab injected attention.requested",
  },
  {
    type: "task.completed",
    label: "Completed",
    summary: "Behavior Lab injected task.completed",
  },
  {
    type: "task.failed",
    label: "Failed",
    summary: "Behavior Lab injected task.failed",
  },
];

export function createAgentStimulusEvent(input: {
  type: BehaviorLabAgentStimulusType;
  pet: PetSnapshot;
  getComponent: BehaviorLabComponentReader;
  now: number;
}): BehaviorLabEventResult {
  const option = AGENT_STIMULUS_OPTIONS.find(
    (candidate) => candidate.type === input.type,
  );
  const binding = input.getComponent(input.pet.id, "AgentBinding");

  if (!binding) {
    return {
      ok: false,
      message: `${input.pet.name} has no AgentBinding, so agent stimuli cannot be routed.`,
    };
  }

  const label = option?.label ?? input.type;
  const summary = `${option?.summary ?? "Behavior Lab injected agent event"} for ${
    input.pet.name
  }`;

  return {
    ok: true,
    event: {
      kind: "agent",
      type: input.type,
      sourceId: binding.sourceId,
      at: input.now,
      summary,
    },
    trace: {
      id: `agent-${input.type}-${input.now}`,
      channel: "agent",
      label,
      type: input.type,
      at: input.now,
      petName: input.pet.name,
    },
  };
}
```

- [ ] **Step 4: Run the adapter tests**

Run:

```bash
pnpm --filter pets-driven test -- tests/playground/behavior-lab-events.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add apps/desktop/src/playground/browser/behavior-lab-events.ts apps/desktop/tests/playground/behavior-lab-events.test.ts
git commit -m "feat: add behavior lab agent stimuli"
```

---

### Task 2: Add Pipeline Explanation Adapter

**Files:**
- Create: `apps/desktop/src/playground/browser/behavior-lab-explanation.ts`
- Test: `apps/desktop/tests/playground/behavior-lab-explanation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/tests/playground/behavior-lab-explanation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ComponentOf, ComponentType } from "@/core/components";
import type { PetSnapshot } from "@/core/world-snapshot";
import {
  explainBehaviorPipeline,
  formatMotionTargetForLab,
} from "@/playground/browser/behavior-lab-explanation";
import type { BehaviorLabStimulusTrace } from "@/playground/browser/behavior-lab-events";

function pet(overrides: Partial<PetSnapshot> = {}): PetSnapshot {
  return {
    id: "pet-a",
    sourceId: "agent-a",
    name: "Alice",
    intent: "idle",
    locomotion: "walking",
    speech: null,
    position: { x: 100, y: 200 },
    contact: { grounded: true, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    heldAgentState: null,
    visualCue: null,
    ...overrides,
  };
}

function trace(overrides: Partial<BehaviorLabStimulusTrace> = {}): BehaviorLabStimulusTrace {
  return {
    id: "agent-task.completed-100",
    channel: "agent",
    label: "Completed",
    type: "task.completed",
    at: 100,
    petName: "Alice",
    ...overrides,
  };
}

function reader(components: Partial<Record<ComponentType, unknown>>) {
  return <TType extends ComponentType>(
    _id: string,
    type: TType,
  ): ComponentOf<TType> | undefined => {
    return components[type] as ComponentOf<TType> | undefined;
  };
}

describe("behavior lab explanation adapter", () => {
  it("shows an idle pipeline before a stimulus is injected", () => {
    const explanation = explainBehaviorPipeline({
      pet: pet(),
      getComponent: reader({}),
      lastStimulus: null,
      now: 0,
    });

    expect(explanation.steps.map((step) => step.id)).toEqual([
      "stimulus",
      "claim",
      "decision",
      "planning",
      "presentation",
    ]);
    expect(explanation.steps[0]).toMatchObject({
      id: "stimulus",
      status: "idle",
      detail: "No lab stimulus has been injected yet.",
    });
  });

  it("explains held completed agent state and speech after task.completed", () => {
    const explanation = explainBehaviorPipeline({
      pet: pet({
        heldAgentState: {
          kind: "completed",
          label: "DONE",
          summary: "Behavior Lab injected task.completed for Alice",
        },
        speech: "Done!",
      }),
      getComponent: reader({
        HeldAgentState: {
          type: "HeldAgentState",
          kind: "completed",
          sourceEventType: "task.completed",
          heldAt: 100,
          summary: "Behavior Lab injected task.completed for Alice",
        },
        SpeechState: {
          type: "SpeechState",
          speech: "Done!",
          expiresAt: 1600,
        },
      }),
      lastStimulus: trace(),
      now: 116,
    });

    expect(explanation.steps[0]).toMatchObject({
      id: "stimulus",
      status: "complete",
      detail: "Completed sent task.completed to Alice at 100ms.",
    });
    expect(explanation.steps[1]).toMatchObject({
      id: "claim",
      status: "complete",
      source: "agent-event",
      reason: "task.completed",
    });
    expect(explanation.steps[4]).toMatchObject({
      id: "presentation",
      status: "complete",
      speech: "Done!",
    });
  });

  it("explains decision token and planning output when present", () => {
    const explanation = explainBehaviorPipeline({
      pet: pet({
        intent: "active",
        motionTarget: { x: 250, y: 400 },
        decision: {
          source: "autonomous",
          reason: "wander-near",
          decidedAt: 200,
        },
      }),
      getComponent: reader({
        BehaviorDecisionToken: {
          type: "BehaviorDecisionToken",
          kind: "wander-near",
          decidedAt: 200,
          consumed: true,
          targetPosition: { x: 250, y: 400 },
        },
        IntentState: {
          type: "IntentState",
          intent: "active",
        },
        MotionTarget: {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 250, y: 400 },
        },
      }),
      lastStimulus: trace({ type: "task.started", label: "Started", at: 180 }),
      now: 216,
    });

    expect(explanation.steps[2]).toMatchObject({
      id: "decision",
      status: "complete",
      tokenKind: "wander-near",
    });
    expect(explanation.steps[3]).toMatchObject({
      id: "planning",
      status: "complete",
      intent: "active",
      motionTarget: "250, 400",
    });
  });

  it("formats target entity, target position, and empty motion targets", () => {
    expect(formatMotionTargetForLab(undefined)).toBe("none");
    expect(
      formatMotionTargetForLab({
        type: "MotionTarget",
        targetEntityId: "pet-b",
        targetPosition: { x: 10, y: 20 },
      }),
    ).toBe("pet-b");
    expect(
      formatMotionTargetForLab({
        type: "MotionTarget",
        targetEntityId: null,
        targetPosition: { x: 10.4, y: 20.6 },
      }),
    ).toBe("10, 21");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter pets-driven test -- tests/playground/behavior-lab-explanation.test.ts
```

Expected: FAIL because `behavior-lab-explanation.ts` does not exist.

- [ ] **Step 3: Add the explanation adapter implementation**

Create `apps/desktop/src/playground/browser/behavior-lab-explanation.ts`:

```ts
import type { ComponentOf, ComponentType } from "@/core/components";
import type { PetSnapshot } from "@/core/world-snapshot";
import type { BehaviorLabStimulusTrace } from "@/playground/browser/behavior-lab-events";

export type BehaviorLabPipelineStepId =
  | "stimulus"
  | "claim"
  | "decision"
  | "planning"
  | "presentation";

export type BehaviorLabPipelineStepStatus = "idle" | "active" | "complete";

export type BehaviorLabPipelineStep = {
  id: BehaviorLabPipelineStepId;
  status: BehaviorLabPipelineStepStatus;
  title: string;
  detail: string;
  source?: string;
  reason?: string;
  tokenKind?: string;
  intent?: string;
  motionTarget?: string;
  action?: string;
  speech?: string;
};

export type BehaviorLabExplanation = {
  steps: BehaviorLabPipelineStep[];
};

type ComponentReader = <TType extends ComponentType>(
  id: string,
  type: TType,
) => ComponentOf<TType> | undefined;

export function explainBehaviorPipeline(input: {
  pet: PetSnapshot;
  getComponent: ComponentReader;
  lastStimulus: BehaviorLabStimulusTrace | null;
  now: number;
}): BehaviorLabExplanation {
  const decision = input.getComponent(input.pet.id, "BehaviorDecisionState");
  const held = input.getComponent(input.pet.id, "HeldAgentState");
  const pendingReaction = input.getComponent(input.pet.id, "PendingReaction");
  const token = input.getComponent(input.pet.id, "BehaviorDecisionToken");
  const intent = input.getComponent(input.pet.id, "IntentState");
  const motion = input.getComponent(input.pet.id, "MotionTarget");
  const jump = input.getComponent(input.pet.id, "JumpActionState");
  const climb = input.getComponent(input.pet.id, "ClimbIntentState");
  const speech = input.getComponent(input.pet.id, "SpeechState");

  const claimSource =
    decision?.source ?? (held ? "agent-event" : pendingReaction?.source);
  const claimReason =
    decision?.reason ?? held?.sourceEventType ?? pendingReaction?.source;
  const action = jump?.phase
    ? `jump:${jump.phase}`
    : climb?.phase
      ? `climb:${climb.phase}`
      : input.pet.action;
  const motionTarget = formatMotionTargetForLab(motion);
  const currentSpeech = speech?.speech ?? input.pet.speech ?? null;

  return {
    steps: [
      explainStimulusStep(input.lastStimulus),
      {
        id: "claim",
        title: "Claim / hold",
        status: claimSource ? "complete" : "idle",
        source: claimSource,
        reason: claimReason,
        detail: claimSource
          ? `${claimSource} owns the current behavior window${
              claimReason ? ` because of ${claimReason}` : ""
            }.`
          : "No active behavior claim, hold, or pending reaction.",
      },
      {
        id: "decision",
        title: "Decision token",
        status: token ? "complete" : "idle",
        tokenKind: token?.kind,
        detail: token
          ? `${token.kind} was ${token.consumed ? "consumed" : "created"} at ${
              token.decidedAt
            }ms.`
          : "No BehaviorDecisionToken is currently visible.",
      },
      {
        id: "planning",
        title: "Planning result",
        status:
          intent?.intent || motionTarget !== "none" || action ? "complete" : "idle",
        intent: intent?.intent ?? input.pet.intent,
        motionTarget,
        action,
        detail: `Intent is ${intent?.intent ?? input.pet.intent}; motion target is ${motionTarget}.`,
      },
      {
        id: "presentation",
        title: "Presentation",
        status: currentSpeech || input.pet.visualCue ? "complete" : "idle",
        speech: currentSpeech ?? undefined,
        detail: currentSpeech
          ? `Speech bubble says "${currentSpeech}".`
          : input.pet.visualCue
            ? `Visual cue ${input.pet.visualCue.label} is active.`
            : "No speech or visual cue is active.",
      },
    ],
  };
}

function explainStimulusStep(
  lastStimulus: BehaviorLabStimulusTrace | null,
): BehaviorLabPipelineStep {
  if (!lastStimulus) {
    return {
      id: "stimulus",
      title: "Stimulus",
      status: "idle",
      detail: "No lab stimulus has been injected yet.",
    };
  }

  return {
    id: "stimulus",
    title: "Stimulus",
    status: "complete",
    detail: `${lastStimulus.label} sent ${lastStimulus.type} to ${lastStimulus.petName} at ${lastStimulus.at}ms.`,
  };
}

export function formatMotionTargetForLab(
  motion: ComponentOf<"MotionTarget"> | undefined,
): string {
  if (!motion) {
    return "none";
  }

  if (motion.targetEntityId) {
    return motion.targetEntityId;
  }

  if (motion.targetPosition) {
    return `${Math.round(motion.targetPosition.x)}, ${Math.round(
      motion.targetPosition.y,
    )}`;
  }

  return "none";
}
```

- [ ] **Step 4: Run the explanation tests**

Run:

```bash
pnpm --filter pets-driven test -- tests/playground/behavior-lab-explanation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add apps/desktop/src/playground/browser/behavior-lab-explanation.ts apps/desktop/tests/playground/behavior-lab-explanation.test.ts
git commit -m "feat: explain behavior lab pipeline"
```

---

### Task 3: Wire Agent Stimuli Into Demo Playground

**Files:**
- Modify: `apps/desktop/src/playground/browser/playground-app.tsx`
- Test: `apps/desktop/tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Add this test near the existing Behavior Lab tests in `apps/desktop/tests/smoke/playground-app.test.tsx`:

```ts
  it("injects Behavior Lab agent stimuli into the real world pipeline", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        rect: vi.fn(),
        stroke: vi.fn(),
        strokeRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
    );

    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: "Completed" }));

    expect(screen.getByText("Completed sent task.completed to Alice at 0ms.")).toBeInTheDocument();
    expect(screen.getByText(/agent-event owns the current behavior window/)).toBeInTheDocument();
    expect(screen.getByText(/task.completed/)).toBeInTheDocument();
    expect(screen.getByText(/Behavior Lab injected task.completed for Alice/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run:

```bash
pnpm --filter pets-driven test -- tests/smoke/playground-app.test.tsx
```

Expected: FAIL because the `Completed` Behavior Lab stimulus button does not exist.

- [ ] **Step 3: Pass the stimulus handler and current time into BehaviorLab**

Modify imports in `apps/desktop/src/playground/browser/playground-app.tsx`:

```ts
import {
  createAgentStimulusEvent,
  type BehaviorLabAgentStimulusType,
  type BehaviorLabStimulusTrace,
} from "./behavior-lab-events";
```

Add state in `DemoPlaygroundView` near the existing agent event state:

```ts
  const [lastBehaviorLabStimulus, setLastBehaviorLabStimulus] =
    useState<BehaviorLabStimulusTrace | null>(null);
  const [behaviorLabStimulusError, setBehaviorLabStimulusError] =
    useState<string | null>(null);
```

Add this handler inside `DemoPlaygroundView`, after `pushAgentEvent`:

```ts
  const handleBehaviorLabAgentStimulus = useCallback(
    (type: BehaviorLabAgentStimulusType) => {
      const selectedPet = scenarioRef.current
        .world
        .snapshot()
        .pets
        .find((pet) => pet.id === selectedPetId);

      if (!selectedPet) {
        setBehaviorLabStimulusError("Selected pet is not present in the current world snapshot.");
        return;
      }

      const result = createAgentStimulusEvent({
        type,
        pet: selectedPet,
        getComponent: (id, componentType) =>
          scenarioRef.current.world.getComponent(id, componentType),
        now: scenarioRef.current.clock.now(),
      });

      if (!result.ok) {
        setBehaviorLabStimulusError(result.message);
        return;
      }

      scenarioRef.current.world.pushEvent(result.event);
      setLastBehaviorLabStimulus(result.trace);
      setBehaviorLabStimulusError(null);
      setLastHookName(null);
      advanceFrame();
    },
    [advanceFrame, selectedPetId],
  );
```

Update the `BehaviorLab` JSX props:

```tsx
          <BehaviorLab
            error={behaviorLabStimulusError}
            getComponent={(id, type) =>
              scenarioRef.current.world.getComponent(id, type)
            }
            lastStimulus={lastBehaviorLabStimulus}
            now={scenarioRef.current.clock.now()}
            onSendAgentStimulus={handleBehaviorLabAgentStimulus}
            onSelectPet={setSelectedPetId}
            pets={snapshot.pets}
            selectedPetId={selectedPetId}
          />
```

- [ ] **Step 4: Run the smoke test and observe type errors**

Run:

```bash
pnpm --filter pets-driven test -- tests/smoke/playground-app.test.tsx
```

Expected: FAIL because `BehaviorLab` does not accept the new props yet.

- [ ] **Step 5: Commit Task 3 after Task 4 makes the test pass**

Do not commit at this point if tests still fail. Task 4 supplies the UI implementation that consumes the new props.

---

### Task 4: Update BehaviorLab UI For Stimuli, Pipeline, And Trace

**Files:**
- Modify: `apps/desktop/src/playground/browser/behavior-lab.tsx`
- Modify: `apps/desktop/src/playground/browser/playground-text.ts`
- Modify: `apps/desktop/src/styles/playground.css`
- Test: `apps/desktop/tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Add stable text constants**

Modify `apps/desktop/src/playground/browser/playground-text.ts`:

```ts
export const PLAYGROUND_TEXT = {
  title: "pets-driven playground",
  pauseAnimation: "Pause animation",
  resumeAnimation: "Resume animation",
  playNextFrame: "Play next frame",
  frameCounterPrefix: "Frame:",
  petStatusTitle: "Pet status",
  behaviorLabTitle: "Behavior lab",
  agentEventPanelTitle: "Agent hook",
  selectedPetLabel: "Selected pet",
  componentPanelTitle: "Components",
  copyStateToClipboard: "Copy state",
  copyStateCopied: "Copied",
  copyStateFailed: "Copy failed",
  hideComponentStateList: "Hide state",
  showComponentStateList: "Show state",
  noSpeech: "No speech",
  oceanTitle: "Personality (OCEAN)",
  decisionTokenLabel: "Last decision",
  pendingReactionLabel: "Pending reaction",
  stimulusGroupAgent: "Agent stimuli",
  behaviorPipelineTitle: "Reaction pipeline",
  behaviorTraceTitle: "Stimulus trace",
  behaviorTraceEmpty: "No lab stimuli yet",
} as const;
```

- [ ] **Step 2: Replace the BehaviorLab prop type and derive explanation**

Modify imports in `apps/desktop/src/playground/browser/behavior-lab.tsx`:

```ts
import {
  AGENT_STIMULUS_OPTIONS,
  type BehaviorLabAgentStimulusType,
  type BehaviorLabStimulusTrace,
} from "./behavior-lab-events";
import {
  explainBehaviorPipeline,
  type BehaviorLabPipelineStep,
} from "./behavior-lab-explanation";
```

Replace `BehaviorLabProps` with:

```ts
type BehaviorLabProps = {
  pets: PetSnapshot[];
  selectedPetId: string;
  onSelectPet(id: string): void;
  getComponent: ComponentReader;
  onSendAgentStimulus(type: BehaviorLabAgentStimulusType): void;
  lastStimulus: BehaviorLabStimulusTrace | null;
  now: number;
  error: string | null;
};
```

Inside `BehaviorLab`, after `selectedPet` is resolved, add:

```ts
  const explanation = useMemo(
    () =>
      explainBehaviorPipeline({
        pet: selectedPet,
        getComponent,
        lastStimulus,
        now,
      }),
    [getComponent, lastStimulus, now, selectedPet],
  );
  const traceRows = lastStimulus ? [lastStimulus] : [];
```

- [ ] **Step 3: Add stimulus, pipeline, and trace sections before the existing state list**

Inside the `return` of `BehaviorLab`, after the selected-pet selector, add:

```tsx
      {error && (
        <p className="behavior-lab__error" role="status">
          {error}
        </p>
      )}

      <section
        aria-label={PLAYGROUND_TEXT.stimulusGroupAgent}
        className="behavior-lab__stimuli"
      >
        <h3>{PLAYGROUND_TEXT.stimulusGroupAgent}</h3>
        <div className="behavior-lab__stimulus-buttons">
          {AGENT_STIMULUS_OPTIONS.map((option) => (
            <Button
              key={option.type}
              onClick={() => onSendAgentStimulus(option.type)}
              size="sm"
              variant={option.type === "task.failed" ? "accent" : "neutral"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </section>

      <section
        aria-label={PLAYGROUND_TEXT.behaviorPipelineTitle}
        className="behavior-lab__pipeline"
      >
        <h3>{PLAYGROUND_TEXT.behaviorPipelineTitle}</h3>
        <ol className="behavior-lab__pipeline-list">
          {explanation.steps.map((step) => (
            <BehaviorPipelineStepView key={step.id} step={step} />
          ))}
        </ol>
      </section>

      <section
        aria-label={PLAYGROUND_TEXT.behaviorTraceTitle}
        className="behavior-lab__trace"
      >
        <h3>{PLAYGROUND_TEXT.behaviorTraceTitle}</h3>
        {traceRows.length === 0 ? (
          <p>{PLAYGROUND_TEXT.behaviorTraceEmpty}</p>
        ) : (
          <ul>
            {traceRows.map((row) => (
              <li key={row.id}>
                <strong>{row.label}</strong>
                <span>{row.type}</span>
                <small>{row.petName}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
```

Add this helper component before `formatClimbIntent`:

```tsx
function BehaviorPipelineStepView({
  step,
}: {
  step: BehaviorLabPipelineStep;
}) {
  return (
    <li className="behavior-lab__pipeline-step" data-status={step.status}>
      <div>
        <strong>{step.title}</strong>
        <span>{step.status}</span>
      </div>
      <p>{step.detail}</p>
      {step.tokenKind ? <code>{step.tokenKind}</code> : null}
      {step.motionTarget ? <code>{step.motionTarget}</code> : null}
    </li>
  );
}
```

- [ ] **Step 4: Extend playground CSS using existing tokens**

Append to `apps/desktop/src/styles/playground.css`:

```css
.behavior-lab__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-xs);
  font-weight: 700;
}

.behavior-lab__stimuli,
.behavior-lab__pipeline,
.behavior-lab__trace {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  background: var(--surface-sunken);
}

.behavior-lab__stimuli h3,
.behavior-lab__pipeline h3,
.behavior-lab__trace h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.behavior-lab__stimulus-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.behavior-lab__pipeline-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.behavior-lab__pipeline-step {
  display: grid;
  gap: 4px;
  padding: var(--space-2);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--surface-card);
}

.behavior-lab__pipeline-step[data-status="complete"] {
  border-color: var(--color-success);
}

.behavior-lab__pipeline-step > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.behavior-lab__pipeline-step p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}

.behavior-lab__pipeline-step code {
  width: fit-content;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text-body);
  font-family: var(--font-mono);
  font-size: var(--text-3xs);
}

.behavior-lab__trace p,
.behavior-lab__trace ul {
  margin: 0;
}

.behavior-lab__trace ul {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  list-style: none;
}

.behavior-lab__trace li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
}
```

- [ ] **Step 5: Run the smoke test**

Run:

```bash
pnpm --filter pets-driven test -- tests/smoke/playground-app.test.tsx
```

Expected: PASS, including the new `Completed` stimulus integration test.

- [ ] **Step 6: Commit Tasks 3 and 4 together**

Run:

```bash
git add apps/desktop/src/playground/browser/playground-app.tsx apps/desktop/src/playground/browser/behavior-lab.tsx apps/desktop/src/playground/browser/playground-text.ts apps/desktop/src/styles/playground.css apps/desktop/tests/smoke/playground-app.test.tsx
git commit -m "feat: make behavior lab interactive"
```

---

### Task 5: Verification And Visual Check

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter pets-driven test -- tests/playground/behavior-lab-events.test.ts tests/playground/behavior-lab-explanation.test.ts tests/smoke/playground-app.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run desktop typecheck**

Run:

```bash
pnpm --filter pets-driven typecheck
```

Expected: PASS.

- [ ] **Step 3: Start the playground dev server**

Run:

```bash
pnpm --filter pets-driven dev:playground
```

Expected: Vite serves the playground, usually on `http://localhost:5174/playground.html`.

- [ ] **Step 4: Browser verification**

Open the playground and verify:

- the existing canvas still renders
- the Behavior Lab contains `Agent stimuli`, `Reaction pipeline`, and `Stimulus trace`
- clicking `Completed` updates the pipeline with `task.completed`
- the component inspector can still be hidden and shown with `Hide state` / `Show state`
- text does not overlap in the sidebar at desktop width

- [ ] **Step 5: Final commit if verification required a small fix**

Only run this if Step 4 required a follow-up fix:

```bash
git add apps/desktop/src/playground/browser/behavior-lab.tsx apps/desktop/src/styles/playground.css apps/desktop/tests/smoke/playground-app.test.tsx
git commit -m "fix: polish behavior lab interaction"
```

If no fix was needed, do not create an empty commit.

---

## Follow-Up Slice

After the agent stimulus slice is stable, implement a separate plan for:

- user interaction stimuli: poke, pet, call
- collision/social setup controls
- richer trace history with more than the latest stimulus
- extracted decision explain output from production behavior scoring, if needed
