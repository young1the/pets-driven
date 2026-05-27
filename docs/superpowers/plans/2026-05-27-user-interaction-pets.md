# User Interaction Pets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in drag, keyboard control, and throw handling for movable entities in the browser pet playground.

**Architecture:** Keep user input as the highest-priority behavior source, but split responsibilities across focused systems. `UserInteractionBehaviorSystem` interprets pointer/keyboard events and writes interaction state, `DraggedEntityKinematicSystem` directly syncs held entities before physics integration, and `KeyboardControlMovementSystem` applies force so keyboard-controlled entities remain inside the physics world.

**Tech Stack:** TypeScript, React, Vitest, Matter.js, Vite.

---

## Scope Check

The spec covers one feature area: user interaction for movable entities. Drag, keyboard control, and throw share the same event stream, capability model, user-priority claim behavior, and renderer cue, so they should be implemented as one plan with several small commits.

## File Structure

- Create: `src/features/interaction/components.ts`
  - Owns opt-in capabilities and runtime interaction state.
- Create: `src/features/interaction/systems.ts`
  - Owns hit-testing, pointer/keyboard event interpretation, drag kinematic sync, throw release velocity, and keyboard force application.
- Modify: `src/core/components.ts`
  - Exports interaction component types and includes them in the ECS `Component` union.
- Modify: `src/core/world-step-context.ts`
  - No new context field is required if world events stay in `events`; keep this file unchanged unless type errors demand imports.
- Modify: `src/core/phases.ts`
  - Replace behavior import for `UserInteractionBehaviorSystem` and add interaction movement systems in the correct phases.
- Modify: `src/features/events/world-event-queue.ts`
  - Add selective draining so the priority-1 user interaction system does not consume agent events and the priority-2 agent system does not consume pointer/keyboard events.
- Modify: `src/features/behavior/systems.ts`
  - Remove the empty `UserInteractionBehaviorSystem` export and make agent event draining selective.
- Modify: `src/features/physics/matter-physics-world.ts`
  - No new method is required; reuse `setPosition`, `setVelocity`, and `applyForce`.
- Modify: `src/core/scenario-fixtures.ts`
  - Add a world-level interaction state entity and default `CanDrag`/`CanControl` capabilities to demo pets.
- Modify: `src/core/create-world.ts`
  - Add interaction state to snapshots.
- Modify: `src/core/world-snapshot.ts`
  - Add snapshot fields for `interaction`.
- Modify: `src/playground/browser/canvas-renderer.ts`
  - Scale grabbed bodies using snapshot interaction cue.
- Modify: `src/playground/browser/playground-app.tsx`
  - Wire pointer and keyboard browser events into the world event queue.
- Test: `tests/features/events/world-event-queue.test.ts`
  - Selective event draining.
- Create: `tests/features/interaction/user-interaction-behavior-system.test.ts`
  - Selection, drag state, keyboard state, and claim behavior.
- Create: `tests/features/interaction/dragged-entity-kinematic-system.test.ts`
  - Position sync and throw release velocity.
- Create: `tests/features/interaction/keyboard-control-movement-system.test.ts`
  - Force-based keyboard movement with physics.
- Modify: `tests/core/world-fixtures.test.ts`
  - Fixture capabilities and snapshot interaction state.
- Modify: `tests/playground/canvas-renderer.test.ts`
  - Dragged scale rendering.
- Modify: `tests/smoke/playground-app.test.tsx`
  - Browser event wiring smoke coverage.

---

### Task 1: Preserve Non-Consumed World Events

**Files:**
- Modify: `src/features/events/world-event-queue.ts`
- Modify: `src/features/behavior/systems.ts`
- Test: `tests/features/events/world-event-queue.test.ts`

- [ ] **Step 1: Write the failing selective-drain tests**

Append these tests:

```ts
it("drains only events matching a predicate and preserves the rest", () => {
  const queue = createWorldEventQueue();
  const agent = { kind: "agent" as const, type: "task.started" as const, sourceId: "a", at: 1 };
  const pointer = { kind: "pointer" as const, type: "pointer.down" as const, pointerId: 1, at: 2, position: { x: 10, y: 20 } };
  const keyboard = { kind: "keyboard" as const, type: "keyboard.down" as const, key: "ArrowRight", code: "ArrowRight", at: 3 };

  queue.push(agent);
  queue.push(pointer);
  queue.push(keyboard);

  expect(queue.drainWhere((event) => event.kind === "pointer")).toEqual([pointer]);
  expect(queue.drain()).toEqual([agent, keyboard]);
});

it("keeps original order among preserved and drained events", () => {
  const queue = createWorldEventQueue();
  const p1 = { kind: "pointer" as const, type: "pointer.down" as const, pointerId: 1, at: 1, position: { x: 1, y: 1 } };
  const a1 = { kind: "agent" as const, type: "task.started" as const, sourceId: "a", at: 2 };
  const p2 = { kind: "pointer" as const, type: "pointer.up" as const, pointerId: 1, at: 3, position: { x: 2, y: 2 } };
  const a2 = { kind: "agent" as const, type: "task.completed" as const, sourceId: "a", at: 4 };

  queue.push(p1);
  queue.push(a1);
  queue.push(p2);
  queue.push(a2);

  expect(queue.drainWhere((event) => event.kind === "agent")).toEqual([a1, a2]);
  expect(queue.drain()).toEqual([p1, p2]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd run test -- tests/features/events/world-event-queue.test.ts`

Expected: FAIL with `Property 'drainWhere' does not exist`.

- [ ] **Step 3: Implement selective draining**

Change `WorldEventQueue`:

```ts
export type WorldEventQueue = {
  push(event: WorldEvent): void;
  drain(): WorldEvent[];
  drainWhere(predicate: (event: WorldEvent) => boolean): WorldEvent[];
};
```

Update `createWorldEventQueue`:

```ts
drainWhere(predicate) {
  const drained: WorldEvent[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const event = items[i];
    if (predicate(event)) {
      drained.unshift(event);
      items.splice(i, 1);
    }
  }
  return drained;
},
```

- [ ] **Step 4: Make agent behavior drain only agent events**

In `AgentEventBehaviorSystem.update`, replace:

```ts
runAgentEventBehaviorSystem(ctx.components, ctx.events.drain(), ctx.clock);
```

with:

```ts
runAgentEventBehaviorSystem(
  ctx.components,
  ctx.events.drainWhere((event) => event.kind === "agent"),
  ctx.clock,
);
```

- [ ] **Step 5: Run tests**

Run: `npm.cmd run test -- tests/features/events/world-event-queue.test.ts tests/adapters/agent-event-adapter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/events/world-event-queue.ts src/features/behavior/systems.ts tests/features/events/world-event-queue.test.ts
git commit -m "feat: selectively drain world events"
```

---

### Task 2: Add Interaction Components And Fixture Capabilities

**Files:**
- Create: `src/features/interaction/components.ts`
- Modify: `src/core/components.ts`
- Modify: `src/core/scenario-fixtures.ts`
- Test: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Write failing fixture tests**

Add tests:

```ts
it("adds drag and control capabilities to demo pets", () => {
  const scenario = createDemoScenario();

  expect(scenario.world.getComponent("pet-a", "CanDrag")).toEqual({ type: "CanDrag" });
  expect(scenario.world.getComponent("pet-a", "CanControl")).toEqual({
    type: "CanControl",
    force: expect.any(Number),
  });
});

it("creates one world-level interaction state entity", () => {
  const scenario = createDemoScenario();

  expect(scenario.world.getComponent("user-interaction", "KeyboardControlTarget")).toEqual({
    type: "KeyboardControlTarget",
    entityId: null,
  });
  expect(scenario.world.getComponent("user-interaction", "KeyboardInputState")).toEqual({
    type: "KeyboardInputState",
    pressedCodes: [],
    vector: { x: 0, y: 0 },
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd run test -- tests/core/world-fixtures.test.ts`

Expected: FAIL with unknown component types or missing components.

- [ ] **Step 3: Create interaction component types**

Create `src/features/interaction/components.ts`:

```ts
import type { Vector } from "@/features/physics/components";

export type CanDragComponent = {
  type: "CanDrag";
};

export type CanControlComponent = {
  type: "CanControl";
  force: number;
};

export type KeyboardControlTargetComponent = {
  type: "KeyboardControlTarget";
  entityId: string | null;
};

export type KeyboardInputStateComponent = {
  type: "KeyboardInputState";
  pressedCodes: string[];
  vector: Vector;
};

export type DragInteractionPhase = "pending" | "dragging";

export type DragSample = {
  at: number;
  position: Vector;
};

export type DragInteractionComponent = {
  type: "DragInteraction";
  pointerId: number;
  entityId: string;
  phase: DragInteractionPhase;
  grabOffset: Vector;
  pointerPosition: Vector;
  startedAt: number;
  samples: DragSample[];
};
```

- [ ] **Step 4: Export interaction components through ECS**

In `src/core/components.ts`, export and import:

```ts
export type {
  CanDragComponent,
  CanControlComponent,
  KeyboardControlTargetComponent,
  KeyboardInputStateComponent,
  DragInteractionComponent,
} from "@/features/interaction/components";
```

Add imported types and include them in `Component`:

```ts
| CanDragComponent
| CanControlComponent
| KeyboardControlTargetComponent
| KeyboardInputStateComponent
| DragInteractionComponent
```

- [ ] **Step 5: Add default fixture capabilities**

In `createFixturePet`, add these default components before `...input.components`:

```ts
{ type: "CanDrag" as const },
{ type: "CanControl" as const, force: DEFAULT_PET_WALK_FORCE * 1.25 },
```

In `createDemoScenario.entities`, add an entity near the user anchor:

```ts
{
  id: "user-interaction",
  components: [
    { type: "KeyboardControlTarget", entityId: null },
    { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
  ],
},
```

- [ ] **Step 6: Run tests**

Run: `npm.cmd run test -- tests/core/world-fixtures.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/interaction/components.ts src/core/components.ts src/core/scenario-fixtures.ts tests/core/world-fixtures.test.ts
git commit -m "feat: add user interaction components"
```

---

### Task 3: Interpret Pointer And Keyboard Events

**Files:**
- Create: `src/features/interaction/systems.ts`
- Modify: `src/core/phases.ts`
- Modify: `src/features/behavior/systems.ts`
- Test: `tests/features/interaction/user-interaction-behavior-system.test.ts`

- [ ] **Step 1: Write failing behavior tests**

Create `tests/features/interaction/user-interaction-behavior-system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { createWorldEventQueue } from "@/features/events/world-event-queue";
import { runUserInteractionBehaviorSystem } from "@/features/interaction/systems";
import { createManualClock } from "@/shared/time/manual-clock";

function createStore() {
  return createComponentStore([
    {
      id: "user-interaction",
      components: [
        { type: "KeyboardControlTarget", entityId: null },
        { type: "KeyboardInputState", pressedCodes: [], vector: { x: 0, y: 0 } },
      ],
    },
    {
      id: "pet-a",
      components: [
        { type: "CanDrag" },
        { type: "CanControl", force: 0.003 },
        { type: "Transform", position: { x: 100, y: 100 } },
        { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      ],
    },
    {
      id: "pet-b",
      components: [
        { type: "Transform", position: { x: 200, y: 100 } },
        { type: "PhysicsBody", shape: "rectangle", width: 40, height: 40 },
      ],
    },
  ]);
}

describe("UserInteractionBehaviorSystem", () => {
  it("selects only CanControl entities on pointer down", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({ kind: "pointer", type: "pointer.down", pointerId: 1, at: 0, position: { x: 100, y: 100 } });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId).toBe("pet-a");
  });

  it("does not select entities without CanControl", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({ kind: "pointer", type: "pointer.down", pointerId: 1, at: 0, position: { x: 200, y: 100 } });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "KeyboardControlTarget")?.entityId).toBeNull();
  });

  it("starts a pending drag only for CanDrag entities", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({ kind: "pointer", type: "pointer.down", pointerId: 7, at: 0, position: { x: 110, y: 90 } });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "DragInteraction")).toMatchObject({
      type: "DragInteraction",
      pointerId: 7,
      entityId: "pet-a",
      phase: "pending",
      grabOffset: { x: -10, y: 10 },
    });
  });

  it("updates keyboard vector from pressed keys", () => {
    const components = createStore();
    const events = createWorldEventQueue();
    const clock = createManualClock(0);

    events.push({ kind: "keyboard", type: "keyboard.down", key: "ArrowRight", code: "ArrowRight", at: 0 });
    events.push({ kind: "keyboard", type: "keyboard.down", key: "ArrowUp", code: "ArrowUp", at: 1 });
    runUserInteractionBehaviorSystem(components, events, clock);

    expect(components.getComponent("user-interaction", "KeyboardInputState")?.vector.x).toBeCloseTo(0.707, 2);
    expect(components.getComponent("user-interaction", "KeyboardInputState")?.vector.y).toBeCloseTo(-0.707, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd run test -- tests/features/interaction/user-interaction-behavior-system.test.ts`

Expected: FAIL because `features/interaction/systems` does not exist.

- [ ] **Step 3: Implement event interpretation**

Create `src/features/interaction/systems.ts` with:

```ts
import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { KeyboardWorldEvent, PointerWorldEvent, WorldEvent } from "@/features/events/world-event";
import type { WorldEventQueue } from "@/features/events/world-event-queue";
import type { Vector } from "@/features/physics/components";
import type { Clock } from "@/shared/time/manual-clock";

const INTERACTION_ENTITY_ID = "user-interaction";
const DRAG_START_DISTANCE = 4;
const MAX_DRAG_SAMPLES = 6;

export function runUserInteractionBehaviorSystem(
  components: ComponentStore,
  events: WorldEventQueue,
  clock: Clock,
): void {
  const inputEvents = events.drainWhere(
    (event): event is PointerWorldEvent | KeyboardWorldEvent =>
      event.kind === "pointer" || event.kind === "keyboard",
  );

  for (const event of inputEvents) {
    if (event.kind === "pointer") handlePointerEvent(components, event, clock);
    if (event.kind === "keyboard") handleKeyboardEvent(components, event);
  }
}

function handlePointerEvent(
  components: ComponentStore,
  event: PointerWorldEvent,
  clock: Clock,
): void {
  if (event.type === "pointer.down") {
    const controlHit = hitTest(components, event.position, "CanControl");
    const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
    if (target) target.entityId = controlHit?.id ?? null;

    const dragHit = hitTest(components, event.position, "CanDrag");
    if (!dragHit) return;

    components.setComponent(INTERACTION_ENTITY_ID, {
      type: "DragInteraction",
      pointerId: event.pointerId,
      entityId: dragHit.id,
      phase: "pending",
      grabOffset: {
        x: dragHit.position.x - event.position.x,
        y: dragHit.position.y - event.position.y,
      },
      pointerPosition: { ...event.position },
      startedAt: clock.now(),
      samples: [{ at: event.at, position: { ...event.position } }],
    });
    return;
  }

  const drag = components.getComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  if (!drag || drag.pointerId !== event.pointerId) return;

  if (event.type === "pointer.move") {
    const first = drag.samples[0]?.position ?? event.position;
    drag.pointerPosition = { ...event.position };
    drag.samples = [...drag.samples, { at: event.at, position: { ...event.position } }].slice(-MAX_DRAG_SAMPLES);
    if (drag.phase === "pending" && distance(first, event.position) >= DRAG_START_DISTANCE) {
      drag.phase = "dragging";
      claimUserInteraction(components, drag.entityId, clock.now(), "dragging", 250);
    }
    return;
  }

  if (event.type === "pointer.up") {
    components.removeComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  }
}

function handleKeyboardEvent(components: ComponentStore, event: KeyboardWorldEvent): void {
  const input = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardInputState");
  if (!input) return;

  const pressed = new Set(input.pressedCodes);
  if (event.type === "keyboard.down") pressed.add(event.code);
  if (event.type === "keyboard.up") pressed.delete(event.code);

  input.pressedCodes = [...pressed];
  input.vector = keyboardVector(pressed);
}

function hitTest(
  components: ComponentStore,
  point: Vector,
  capability: "CanDrag" | "CanControl",
): { id: string; position: Vector } | null {
  const hits: Array<{ id: string; position: Vector; area: number }> = [];
  components.forEach(["Transform", "PhysicsBody", capability], (id, [transform, body]) => {
    const halfW = body.width / 2;
    const halfH = body.height / 2;
    if (
      point.x >= transform.position.x - halfW &&
      point.x <= transform.position.x + halfW &&
      point.y >= transform.position.y - halfH &&
      point.y <= transform.position.y + halfH
    ) {
      hits.push({ id, position: transform.position, area: body.width * body.height });
    }
  });
  hits.sort((a, b) => a.area - b.area);
  return hits[0] ?? null;
}

function keyboardVector(pressed: Set<string>): Vector {
  const x = Number(pressed.has("ArrowRight") || pressed.has("KeyD")) - Number(pressed.has("ArrowLeft") || pressed.has("KeyA"));
  const y = Number(pressed.has("ArrowDown") || pressed.has("KeyS")) - Number(pressed.has("ArrowUp") || pressed.has("KeyW"));
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

function claimUserInteraction(
  components: ComponentStore,
  id: string,
  now: number,
  reason: string,
  durationMs: number,
): void {
  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source: "user-interaction",
    decidedAt: now,
    expiresAt: now + durationMs,
    reason,
    lastAutonomousReason: null,
    lastAutonomousAt: null,
  });
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const UserInteractionBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "UserInteractionBehaviorSystem",
  dependsOn: ["ContactSystem"],
  reads: ["WorldEventQueue", "Transform", "PhysicsBody", "CanDrag", "CanControl", "KeyboardControlTarget", "KeyboardInputState", "DragInteraction"],
  writes: ["KeyboardControlTarget", "KeyboardInputState", "DragInteraction", "BehaviorDecisionState"],
  update(ctx) {
    runUserInteractionBehaviorSystem(ctx.components, ctx.events, ctx.clock);
  },
};
```

- [ ] **Step 4: Move system import to interaction feature**

In `src/features/behavior/systems.ts`, delete the empty `runUserInteractionBehaviorSystem` and `UserInteractionBehaviorSystem` export.

In `src/core/phases.ts`, change:

```ts
import {
  UserInteractionBehaviorSystem,
  AgentEventBehaviorSystem,
  ...
} from "@/features/behavior/systems";
```

to:

```ts
import { UserInteractionBehaviorSystem } from "@/features/interaction/systems";
import {
  AgentEventBehaviorSystem,
  ...
} from "@/features/behavior/systems";
```

- [ ] **Step 5: Run tests**

Run: `npm.cmd run test -- tests/features/interaction/user-interaction-behavior-system.test.ts tests/core/world-fixtures.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/interaction/systems.ts src/core/phases.ts src/features/behavior/systems.ts tests/features/interaction/user-interaction-behavior-system.test.ts
git commit -m "feat: interpret user interaction events"
```

---

### Task 4: Kinematic Drag And Throw Release

**Files:**
- Modify: `src/features/interaction/systems.ts`
- Modify: `src/core/phases.ts`
- Test: `tests/features/interaction/dragged-entity-kinematic-system.test.ts`

- [ ] **Step 1: Write failing drag/throw tests**

Create `tests/features/interaction/dragged-entity-kinematic-system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runDraggedEntityKinematicSystem, releaseVelocityFromSamples } from "@/features/interaction/systems";

function createPhysicsSpy() {
  return {
    positions: [] as Array<{ id: string; position: { x?: number; y?: number } }>,
    velocities: [] as Array<{ id: string; velocity: { x?: number; y?: number } }>,
    setPosition(id: string, position: { x?: number; y?: number }) {
      this.positions.push({ id, position });
    },
    setVelocity(id: string, velocity: { x?: number; y?: number }) {
      this.velocities.push({ id, velocity });
    },
  };
}

describe("DraggedEntityKinematicSystem", () => {
  it("directly syncs dragging entity to pointer plus grab offset", () => {
    const components = createComponentStore([
      { id: "user-interaction", components: [
        {
          type: "DragInteraction",
          pointerId: 1,
          entityId: "pet-a",
          phase: "dragging",
          grabOffset: { x: 5, y: -10 },
          pointerPosition: { x: 120, y: 90 },
          startedAt: 0,
          samples: [],
        },
      ] },
      { id: "pet-a", components: [{ type: "Transform", position: { x: 0, y: 0 } }] },
    ]);
    const physics = createPhysicsSpy();

    runDraggedEntityKinematicSystem(components, physics);

    expect(components.getComponent("pet-a", "Transform")?.position).toEqual({ x: 125, y: 80 });
    expect(physics.positions).toEqual([{ id: "pet-a", position: { x: 125, y: 80 } }]);
    expect(physics.velocities).toEqual([{ id: "pet-a", velocity: { x: 0, y: 0 } }]);
  });

  it("computes release velocity from recent samples in pixels per 16ms tick", () => {
    expect(releaseVelocityFromSamples([
      { at: 0, position: { x: 0, y: 0 } },
      { at: 32, position: { x: 64, y: 32 } },
    ])).toEqual({ x: 32, y: 16 });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd run test -- tests/features/interaction/dragged-entity-kinematic-system.test.ts`

Expected: FAIL because functions are missing.

- [ ] **Step 3: Implement kinematic sync and release helper**

Add to `src/features/interaction/systems.ts`:

```ts
type KinematicPhysics = {
  setPosition(id: string, position: Partial<Vector>): void;
  setVelocity(id: string, velocity: Partial<Vector>): void;
};

export function runDraggedEntityKinematicSystem(
  components: ComponentStore,
  physics: KinematicPhysics,
): void {
  const drag = components.getComponent(INTERACTION_ENTITY_ID, "DragInteraction");
  if (!drag || drag.phase !== "dragging") return;

  const nextPosition = {
    x: drag.pointerPosition.x + drag.grabOffset.x,
    y: drag.pointerPosition.y + drag.grabOffset.y,
  };
  const transform = components.getComponent(drag.entityId, "Transform");
  if (transform) transform.position = nextPosition;

  physics.setPosition(drag.entityId, nextPosition);
  physics.setVelocity(drag.entityId, { x: 0, y: 0 });
}

export function releaseVelocityFromSamples(samples: Array<{ at: number; position: Vector }>): Vector {
  if (samples.length < 2) return { x: 0, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = Math.max(1, last.at - first.at);
  const ticks = elapsed / 16;
  return {
    x: (last.position.x - first.position.x) / ticks,
    y: (last.position.y - first.position.y) / ticks,
  };
}
```

- [ ] **Step 4: Apply throw velocity on pointer up**

In `handlePointerEvent`, before removing `DragInteraction` on `pointer.up`, compute and store velocity by setting physics velocity is not available in behavior phase. Instead add a short-lived component:

First add this component in `src/features/interaction/components.ts` and `src/core/components.ts`:

```ts
export type ThrowImpulseComponent = {
  type: "ThrowImpulse";
  velocity: Vector;
};
```

Then in `pointer.up`:

```ts
const velocity = releaseVelocityFromSamples(drag.samples);
if (Math.hypot(velocity.x, velocity.y) >= 8) {
  components.setComponent(drag.entityId, { type: "ThrowImpulse", velocity });
  claimUserInteraction(components, drag.entityId, clock.now(), "throw", 500);
}
components.removeComponent(INTERACTION_ENTITY_ID, "DragInteraction");
```

Add a force/velocity application function:

```ts
export function runThrowImpulseSystem(
  components: ComponentStore,
  physics: Pick<KinematicPhysics, "setVelocity">,
): void {
  components.forEach(["ThrowImpulse"], (id, [throwImpulse]) => {
    physics.setVelocity(id, throwImpulse.velocity);
    components.removeComponent(id, "ThrowImpulse");
  });
}
```

Add descriptors:

```ts
export const DraggedEntityKinematicSystem: SimulationSystem<WorldStepContext> = {
  name: "DraggedEntityKinematicSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["DragInteraction", "Transform"],
  writes: ["Transform", "PhysicsPosition", "PhysicsVelocity"],
  update(ctx) {
    runDraggedEntityKinematicSystem(ctx.components, ctx.physics);
  },
};

export const ThrowImpulseSystem: SimulationSystem<WorldStepContext> = {
  name: "ThrowImpulseSystem",
  dependsOn: ["DraggedEntityKinematicSystem"],
  reads: ["ThrowImpulse"],
  writes: ["PhysicsVelocity", "ThrowImpulse"],
  update(ctx) {
    runThrowImpulseSystem(ctx.components, ctx.physics);
  },
};
```

- [ ] **Step 5: Add systems to pipeline**

In `src/core/phases.ts`, import:

```ts
DraggedEntityKinematicSystem,
ThrowImpulseSystem,
```

Place both in `POST_UPDATE` after `FlightSystem` and before `SIMULATE`. `DraggedEntityKinematicSystem` runs late enough to override ordinary movement for held entities, and `ThrowImpulseSystem` runs before `PhysicsIntegrationSystem`.

- [ ] **Step 6: Run tests**

Run: `npm.cmd run test -- tests/features/interaction/dragged-entity-kinematic-system.test.ts tests/features/interaction/user-interaction-behavior-system.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/interaction/components.ts src/features/interaction/systems.ts src/core/components.ts src/core/phases.ts tests/features/interaction/dragged-entity-kinematic-system.test.ts
git commit -m "feat: drag and throw movable entities"
```

---

### Task 5: Force-Based Keyboard Control

**Files:**
- Modify: `src/features/interaction/systems.ts`
- Modify: `src/core/phases.ts`
- Test: `tests/features/interaction/keyboard-control-movement-system.test.ts`

- [ ] **Step 1: Write failing keyboard movement tests**

Create `tests/features/interaction/keyboard-control-movement-system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runKeyboardControlMovementSystem } from "@/features/interaction/systems";
import type { Force } from "@/features/physics/systems";
import { createManualClock } from "@/shared/time/manual-clock";

describe("KeyboardControlMovementSystem", () => {
  it("does nothing without a control target", () => {
    const components = createComponentStore([
      { id: "user-interaction", components: [
        { type: "KeyboardControlTarget", entityId: null },
        { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
      ] },
    ]);
    const forceGroups: Force[][] = [];

    runKeyboardControlMovementSystem(components, forceGroups, createManualClock(0));

    expect(forceGroups).toEqual([]);
  });

  it("applies force to the selected CanControl target", () => {
    const components = createComponentStore([
      { id: "user-interaction", components: [
        { type: "KeyboardControlTarget", entityId: "pet-a" },
        { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
      ] },
      { id: "pet-a", components: [{ type: "CanControl", force: 0.003 }] },
    ]);
    const forceGroups: Force[][] = [];
    const clock = createManualClock(0);

    runKeyboardControlMovementSystem(components, forceGroups, clock);

    expect(forceGroups).toEqual([[{ id: "pet-a", x: 0.003, y: 0 }]]);
    expect(components.getComponent("pet-a", "BehaviorDecisionState")).toMatchObject({
      source: "user-interaction",
      reason: "keyboard-control",
    });
  });

  it("does not apply force when target lacks CanControl", () => {
    const components = createComponentStore([
      { id: "user-interaction", components: [
        { type: "KeyboardControlTarget", entityId: "pet-a" },
        { type: "KeyboardInputState", pressedCodes: ["ArrowRight"], vector: { x: 1, y: 0 } },
      ] },
      { id: "pet-a", components: [] },
    ]);
    const forceGroups: Force[][] = [];

    runKeyboardControlMovementSystem(components, forceGroups, createManualClock(0));

    expect(forceGroups).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd run test -- tests/features/interaction/keyboard-control-movement-system.test.ts`

Expected: FAIL because `runKeyboardControlMovementSystem` is missing.

- [ ] **Step 3: Implement keyboard control force system**

Add to `src/features/interaction/systems.ts`:

```ts
export function runKeyboardControlMovementSystem(
  components: ComponentStore,
  forceGroups: Force[][],
  clock: Clock,
): void {
  const target = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardControlTarget");
  const input = components.getComponent(INTERACTION_ENTITY_ID, "KeyboardInputState");
  if (!target?.entityId || !input) return;
  if (input.vector.x === 0 && input.vector.y === 0) return;

  const canControl = components.getComponent(target.entityId, "CanControl");
  if (!canControl) return;

  forceGroups.push([{
    id: target.entityId,
    x: input.vector.x * canControl.force,
    y: input.vector.y * canControl.force,
  }]);
  claimUserInteraction(components, target.entityId, clock.now(), "keyboard-control", 250);
}

export const KeyboardControlMovementSystem: SimulationSystem<WorldStepContext> = {
  name: "KeyboardControlMovementSystem",
  dependsOn: ["IntentSteeringSystem"],
  reads: ["KeyboardControlTarget", "KeyboardInputState", "CanControl"],
  writes: ["PhysicsForce", "BehaviorDecisionState"],
  update(ctx) {
    runKeyboardControlMovementSystem(ctx.components, ctx.forceGroups, ctx.clock);
  },
};
```

Import `Force` at top:

```ts
import type { Force } from "@/features/physics/systems";
```

- [ ] **Step 4: Add system to pipeline**

In `src/core/phases.ts`, put `KeyboardControlMovementSystem` in `POST_UPDATE` after `IntentSteeringSystem` and before `FlightSystem`. This keeps it force-based and still inside physics integration.

- [ ] **Step 5: Run tests**

Run: `npm.cmd run test -- tests/features/interaction/keyboard-control-movement-system.test.ts tests/features/movement/walk-system.test.ts tests/features/physics/physics-world.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/interaction/systems.ts src/core/phases.ts tests/features/interaction/keyboard-control-movement-system.test.ts
git commit -m "feat: control entities with keyboard force"
```

---

### Task 6: Expose Interaction Cues In Snapshots And Renderer

**Files:**
- Modify: `src/core/world-snapshot.ts`
- Modify: `src/core/create-world.ts`
- Modify: `src/playground/browser/canvas-renderer.ts`
- Test: `tests/core/world-fixtures.test.ts`
- Test: `tests/playground/canvas-renderer.test.ts`

- [ ] **Step 1: Write failing snapshot and renderer tests**

Add a world fixture test:

```ts
it("marks dragged pets with an interaction scale cue", () => {
  const scenario = createDemoScenario();
  scenario.world.setComponent("user-interaction", {
    type: "DragInteraction",
    pointerId: 1,
    entityId: "pet-a",
    phase: "dragging",
    grabOffset: { x: 0, y: 0 },
    pointerPosition: { x: 600, y: 500 },
    startedAt: 0,
    samples: [],
  });

  const pet = scenario.world.snapshot().pets.find((entry) => entry.id === "pet-a");

  expect(pet?.interaction).toEqual({ dragged: true, selected: false, controlled: false, scale: 1.12 });
});
```

Add a canvas renderer test that builds a snapshot body with interaction:

```ts
it("scales dragged pet sprites around their center", () => {
  const context = createMockCanvasContext();
  const sprite = {} as HTMLImageElement;

  drawWorld(context, {
    width: 960,
    height: 540,
    bodies: [{
      id: "pet-a",
      x: 100,
      y: 120,
      vx: 0,
      vy: 0,
      shape: "rectangle",
      width: 40,
      height: 50,
      animationState: "idle",
      interaction: { dragged: true, scale: 1.12 },
    }],
    pets: [],
    climbableSurfaces: [],
  }, { "pet-a": sprite }, 0);

  expect(context.drawImage).toHaveBeenCalledWith(
    sprite,
    expect.any(Number),
    expect.any(Number),
    192,
    208,
    100 - 40 * 1.12 / 2,
    120 - 50 * 1.12 / 2,
    40 * 1.12,
    50 * 1.12,
  );
});
```

Use the existing mock helper shape in `tests/playground/canvas-renderer.test.ts`; do not create a second mock framework.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd run test -- tests/core/world-fixtures.test.ts tests/playground/canvas-renderer.test.ts`

Expected: FAIL because `interaction` fields are missing.

- [ ] **Step 3: Add snapshot types**

In `src/core/world-snapshot.ts`:

```ts
export type InteractionSnapshot = {
  selected?: boolean;
  dragged?: boolean;
  controlled?: boolean;
  scale?: number;
};
```

Add `interaction?: InteractionSnapshot` to both `BodySnapshot` and `PetSnapshot`.

- [ ] **Step 4: Populate interaction snapshots**

In `src/core/create-world.ts`, add:

```ts
function getInteractionSnapshot(componentStore: ComponentStore, id: string) {
  const drag = componentStore.getComponent("user-interaction", "DragInteraction");
  const target = componentStore.getComponent("user-interaction", "KeyboardControlTarget");
  const dragged = drag?.entityId === id && drag.phase === "dragging";
  const controlled = target?.entityId === id;
  const selected = controlled;
  if (!dragged && !controlled && !selected) return undefined;
  return {
    selected,
    dragged,
    controlled,
    scale: dragged ? 1.12 : undefined,
  };
}
```

Add `interaction: getInteractionSnapshot(componentStore, entity.id)` in pet snapshots and `interaction: getInteractionSnapshot(components, body.id)` in body snapshots.

- [ ] **Step 5: Scale renderer draw calls**

In `canvas-renderer.ts`, before each sprite `drawImage`, compute:

```ts
const scale = body.interaction?.scale ?? 1;
const drawWidth = body.width * scale;
const drawHeight = body.height * scale;
```

Use `drawWidth` and `drawHeight` in mirrored and non-mirrored paths:

```ts
-drawWidth / 2,
-drawHeight / 2,
drawWidth,
drawHeight,
```

and:

```ts
body.x - drawWidth / 2,
body.y - drawHeight / 2,
drawWidth,
drawHeight,
```

- [ ] **Step 6: Run tests**

Run: `npm.cmd run test -- tests/core/world-fixtures.test.ts tests/playground/canvas-renderer.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/world-snapshot.ts src/core/create-world.ts src/playground/browser/canvas-renderer.ts tests/core/world-fixtures.test.ts tests/playground/canvas-renderer.test.ts
git commit -m "feat: render user interaction cues"
```

---

### Task 7: Wire Browser Pointer And Keyboard Events

**Files:**
- Modify: `src/playground/browser/playground-app.tsx`
- Test: `tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Write failing smoke tests**

Add tests using React Testing Library:

```ts
it("forwards pointer events from the canvas to the world", () => {
  render(<PlaygroundApp />);
  const canvas = screen.getByTestId("world-canvas");

  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 600, clientY: 500, button: 0 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 620, clientY: 500 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 620, clientY: 500 });

  expect(canvas).toBeInTheDocument();
});

it("listens for keyboard control events while mounted", () => {
  render(<PlaygroundApp />);

  fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
  fireEvent.keyUp(window, { key: "ArrowRight", code: "ArrowRight" });

  expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
});
```

These tests are smoke-level because the world state is already covered by system tests.

- [ ] **Step 2: Run tests to verify current behavior**

Run: `npm.cmd run test -- tests/smoke/playground-app.test.tsx`

Expected: PASS may already occur because no assertions inspect internals. If it passes before implementation, keep the test as regression coverage and proceed.

- [ ] **Step 3: Add event forwarding helpers**

In `PlaygroundApp`, add:

```ts
function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const scaleX = event.currentTarget.width / rect.width;
  const scaleY = event.currentTarget.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function pushPointerEvent(event: React.PointerEvent<HTMLCanvasElement>, type: "pointer.down" | "pointer.move" | "pointer.up") {
  scenarioRef.current.world.pushEvent({
    kind: "pointer",
    type,
    pointerId: event.pointerId,
    at: scenarioRef.current.clock.now(),
    position: canvasPoint(event),
    button: event.button,
  });
}
```

Attach to canvas:

```tsx
onPointerDown={(event) => {
  event.currentTarget.setPointerCapture(event.pointerId);
  pushPointerEvent(event, "pointer.down");
}}
onPointerMove={(event) => pushPointerEvent(event, "pointer.move")}
onPointerUp={(event) => {
  pushPointerEvent(event, "pointer.up");
  event.currentTarget.releasePointerCapture(event.pointerId);
}}
```

Add keyboard effect:

```ts
useEffect(() => {
  function pushKeyboardEvent(event: KeyboardEvent, type: "keyboard.down" | "keyboard.up") {
    scenarioRef.current.world.pushEvent({
      kind: "keyboard",
      type,
      key: event.key,
      code: event.code,
      at: scenarioRef.current.clock.now(),
      repeat: event.repeat,
    });
  }

  const down = (event: KeyboardEvent) => pushKeyboardEvent(event, "keyboard.down");
  const up = (event: KeyboardEvent) => pushKeyboardEvent(event, "keyboard.up");
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}, []);
```

- [ ] **Step 4: Run smoke tests**

Run: `npm.cmd run test -- tests/smoke/playground-app.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/playground/browser/playground-app.tsx tests/smoke/playground-app.test.tsx
git commit -m "feat: forward browser input to world"
```

---

### Task 8: Final Integration And Verification

**Files:**
- Verify: `src/features/events/world-event-queue.ts`
- Verify: `src/features/interaction/components.ts`
- Verify: `src/features/interaction/systems.ts`
- Verify: `src/core/components.ts`
- Verify: `src/core/phases.ts`
- Verify: `src/core/create-world.ts`
- Verify: `src/core/world-snapshot.ts`
- Verify: `src/playground/browser/canvas-renderer.ts`
- Verify: `src/playground/browser/playground-app.tsx`

- [ ] **Step 1: Run focused interaction tests**

Run:

```bash
npm.cmd run test -- tests/features/events/world-event-queue.test.ts tests/features/interaction/user-interaction-behavior-system.test.ts tests/features/interaction/dragged-entity-kinematic-system.test.ts tests/features/interaction/keyboard-control-movement-system.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run sprite/renderer contract tests**

Run:

```bash
npm.cmd run test -- tests/pets/pet-atlas.test.ts tests/core/pet-animation-state.test.ts tests/playground/canvas-renderer.test.ts
```

Expected: PASS. This guards the atlas direction contract while interaction cues are added.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm.cmd run test
```

Expected: PASS.

- [ ] **Step 4: Optional browser check**

Run:

```bash
npm.cmd run dev -- --host 127.0.0.1
```

Open the printed localhost URL and verify:

- clicking a pet selects it for keyboard control
- dragging a pet scales it up slightly and follows the pointer
- releasing a fast drag throws it
- arrow keys or WASD move the selected pet while it still collides/falls

- [ ] **Step 5: Stop on integration failure**

If any verification command fails, return to the task that introduced the failing file and add a focused test there before changing code. Do not create a broad final integration commit; every code change belongs to one of Tasks 1-7.

---

## Self-Review

Spec coverage:

- `CanDrag` and `CanControl`: Task 2.
- Selection separate from DnD and no target fallback: Task 3.
- Kinematic DnD with held scale cue: Tasks 4 and 6.
- Throw from release samples: Task 4.
- Keyboard control inside physics using force: Task 5.
- Priority-1 user claim: Tasks 3, 4, and 5.
- Browser input wiring: Task 7.
- Focused and full verification: Task 8.

Plan scan: no incomplete markers or unspecified edge handling remains in this plan.

Type consistency: component names match the planned ECS union names; system names match the planned phase imports; event queue `drainWhere` is introduced before any user of it.
