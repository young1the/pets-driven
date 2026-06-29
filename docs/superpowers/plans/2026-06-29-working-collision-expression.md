# Working Collision Expression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual-only collision expression overlay for working pets, with OCEAN-derived expression type and duration, while keeping the agent task in `working` and immediately reselecting `working-focus` or `working-wander`.

**Architecture:** Add `PetExpressionState` as a presentation-only ECS component, plus a small expiration system. `CollisionBehaviorSystem` writes this expression instead of creating long collision behavior tokens for working pets, clears stale working motion/claims, and lets `WorkingBehaviorSystem` reselect in the same BEHAVIOR phase. Snapshots expose the expression, and desktop projection renders it as a decision emote with priority over behavior decision emotes.

**Tech Stack:** TypeScript, Vitest, ECS `ComponentStore`, pet-engine package, desktop projection tests

---

## Global Constraints

- All in-repo comments, docs, test names, commit messages, and PR text must be in English.
- No new npm packages.
- Run pet-engine tests with: `cd packages/pet-engine && npx vitest run`
- Run desktop projection tests with: `cd apps/desktop && npx vitest run tests/pet-window/pet-window-projection.test.ts`
- Run prettier before each commit on changed files.
- Commit messages use English `[Misc]` prefix because repository instructions require English git history.
- The current worktree contains unrelated `apps/desktop` changes. Do not revert or rewrite them. Stage only files touched by each task.

---

## File Structure

- `packages/pet-engine/src/features/behavior/components.ts`
  - Add `PetExpressionStateComponent` type.
- `packages/pet-engine/src/core/components.ts`
  - Export/import `PetExpressionStateComponent` and include it in the `Component` union.
- `packages/pet-engine/src/features/behavior/systems.ts`
  - Add expression expiry system.
  - Add OCEAN expression helpers.
  - Route working collisions to expression-only handling.
- `packages/pet-engine/src/core/phases.ts`
  - Register expression expiry in BEHAVIOR before collision decisions.
- `packages/pet-engine/src/core/world-snapshot.ts`
  - Add `PetExpressionSnapshot` and `PetSnapshot.expression`.
- `packages/pet-engine/src/core/create-world.ts`
  - Populate expression snapshot.
- `packages/pet-engine/src/pets/rendering/behavior-token-presentation.ts`
  - Add expression-to-emote presentation helper.
- `apps/desktop/src/pet-window/pet-window-projection.ts`
  - Prefer expression emote over decision emote.
- Tests:
  - `packages/pet-engine/tests/features/behavior/pet-expression-system.test.ts`
  - `packages/pet-engine/tests/features/behavior/collision-behavior-system.test.ts`
  - `packages/pet-engine/tests/core/world-fixtures.test.ts`
  - `apps/desktop/tests/pet-window/pet-window-projection.test.ts`

---

### Task 1: PetExpressionState Component and Expiration System

**Files:**

- Modify: `packages/pet-engine/src/features/behavior/components.ts`
- Modify: `packages/pet-engine/src/core/components.ts`
- Modify: `packages/pet-engine/src/features/behavior/systems.ts`
- Modify: `packages/pet-engine/src/core/phases.ts`
- Modify: `packages/pet-engine/tests/core/world-fixtures.test.ts`
- Create: `packages/pet-engine/tests/features/behavior/pet-expression-system.test.ts`

- [ ] **Step 1: Write the failing expiration tests**

Create `packages/pet-engine/tests/features/behavior/pet-expression-system.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runPetExpressionExpirationSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

describe("runPetExpressionExpirationSystem", () => {
  it("keeps active expressions before expiry", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          {
            type: "PetExpressionState",
            source: "collision",
            mood: "confused",
            emote: "exclaim",
            label: "!",
            startedAt: 100,
            expiresAt: 700,
          },
        ],
      },
    ]);

    runPetExpressionExpirationSystem(store, createManualClock(699));

    expect(store.getComponent("pet", "PetExpressionState")).toMatchObject({
      source: "collision",
      label: "!",
    });
  });

  it("removes expired expressions", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          {
            type: "PetExpressionState",
            source: "collision",
            mood: "confused",
            emote: "exclaim",
            label: "!",
            startedAt: 100,
            expiresAt: 700,
          },
        ],
      },
    ]);

    runPetExpressionExpirationSystem(store, createManualClock(700));

    expect(store.getComponent("pet", "PetExpressionState")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/pet-engine
npx vitest run tests/features/behavior/pet-expression-system.test.ts
```

Expected: FAIL because `runPetExpressionExpirationSystem` and `PetExpressionState` are not implemented.

- [ ] **Step 3: Add the component type**

In `packages/pet-engine/src/features/behavior/components.ts`, add imports near the top:

```ts
import type { PetEmoteKind, PetMood } from "@pets-driven/design-system";
```

Add this type after `PendingReactionComponent`:

```ts
export type PetExpressionSource = "collision";

export type PetExpressionStateComponent = {
  type: "PetExpressionState";
  source: PetExpressionSource;
  mood: PetMood;
  emote: PetEmoteKind;
  label: string | null;
  startedAt: number;
  expiresAt: number;
};
```

In `packages/pet-engine/src/core/components.ts`, update the behavior exports:

```ts
export type {
  PetIntent,
  IntentStateComponent,
  PetIdentityComponent,
  UserAnchorComponent,
  BehaviorDecisionSource,
  BehaviorDecisionStateComponent,
  PersonalityComponent,
  BehaviorDecisionKind,
  BehaviorDecisionTokenComponent,
  ReactionSource,
  PendingReactionComponent,
  PetExpressionSource,
  PetExpressionStateComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
```

Update the behavior import in the same file:

```ts
import type {
  IntentStateComponent,
  PetIdentityComponent,
  UserAnchorComponent,
  BehaviorDecisionStateComponent,
  PersonalityComponent,
  BehaviorDecisionTokenComponent,
  PendingReactionComponent,
  PetExpressionStateComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
```

Add `PetExpressionStateComponent` to the `Component` union:

```ts
export type Component =
  | ActivityStateComponent
  | PetExpressionStateComponent
  | PendingReactionComponent
  | BehaviorDecisionTokenComponent;
// keep the remaining existing entries unchanged
```

- [ ] **Step 4: Implement expression expiration**

In `packages/pet-engine/src/features/behavior/systems.ts`, add this function after `runSpeechExpirationSystem`:

```ts
export function runPetExpressionExpirationSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  const now = clock.now();
  components.forEach(["PetExpressionState"], (id, [expression]) => {
    if (expression.expiresAt > now) return;
    components.removeComponent(id, "PetExpressionState");
  });
}
```

Add this descriptor near the other system descriptors:

```ts
export const PetExpressionExpirationSystem: SimulationSystem<WorldStepContext> =
  {
    name: "PetExpressionExpirationSystem",
    dependsOn: ["SpeechExpirationSystem"],
    reads: ["PetExpressionState"],
    writes: ["PetExpressionState"],
    update(ctx) {
      runPetExpressionExpirationSystem(ctx.components, ctx.clock);
    },
  };
```

Update `AgentEventBehaviorSystem.dependsOn` to preserve ordering:

```ts
dependsOn: ["PetExpressionExpirationSystem"],
```

In `packages/pet-engine/src/core/phases.ts`, import `PetExpressionExpirationSystem` and insert it after `SpeechExpirationSystem`:

```ts
BEHAVIOR: [
  UserInteractionBehaviorSystem,
  SpeechExpirationSystem,
  PetExpressionExpirationSystem,
  AgentEventBehaviorSystem,
  CollisionBehaviorSystem,
  WorkingBehaviorSystem,
  BehaviorDecisionSystem,
  AutonomousBehaviorSystem,
  BehaviorPlanningSystem,
],
```

In `packages/pet-engine/tests/core/world-fixtures.test.ts`, update the expected system order and metadata:

```ts
"SpeechExpirationSystem",
"PetExpressionExpirationSystem",
"AgentEventBehaviorSystem",
```

Add metadata assertion:

```ts
expect(scenario.world.systemPlan()).toContainEqual({
  name: "PetExpressionExpirationSystem",
  dependsOn: ["SpeechExpirationSystem"],
  reads: ["PetExpressionState"],
  writes: ["PetExpressionState"],
});
```

Update the `AgentEventBehaviorSystem` metadata assertion to:

```ts
dependsOn: ["PetExpressionExpirationSystem"],
```

- [ ] **Step 5: Run targeted tests**

```bash
cd packages/pet-engine
npx vitest run tests/features/behavior/pet-expression-system.test.ts tests/core/world-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full pet-engine suite**

```bash
cd packages/pet-engine
npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
cd packages/pet-engine
npx prettier --write src/features/behavior/components.ts src/core/components.ts src/features/behavior/systems.ts src/core/phases.ts tests/features/behavior/pet-expression-system.test.ts tests/core/world-fixtures.test.ts
cd ../..
git add packages/pet-engine/src/features/behavior/components.ts packages/pet-engine/src/core/components.ts packages/pet-engine/src/features/behavior/systems.ts packages/pet-engine/src/core/phases.ts packages/pet-engine/tests/features/behavior/pet-expression-system.test.ts packages/pet-engine/tests/core/world-fixtures.test.ts
git commit -m "[Misc] Add pet expression state expiration"
```

---

### Task 2: Working Collision Writes Visual Expression Instead of Long Collision Behavior

**Files:**

- Modify: `packages/pet-engine/src/features/behavior/systems.ts`
- Modify: `packages/pet-engine/tests/features/behavior/collision-behavior-system.test.ts`

- [ ] **Step 1: Write failing working-collision tests**

Add these tests near the collision behavior tests in `packages/pet-engine/tests/features/behavior/collision-behavior-system.test.ts`:

```ts
it("working pet collision writes a visual expression and clears working wander target", () => {
  const store = createComponentStore([
    {
      id: "pet-a",
      components: [
        { type: "Transform" as const, position: { x: 100, y: 500 } },
        {
          type: "PhysicsBody" as const,
          shape: "rectangle",
          width: 32,
          height: 38,
        },
        { type: "IntentState" as const, intent: "active" },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: { x: 300, y: 500 },
        },
        { type: "AgentTaskState" as const, status: "working", since: 0 },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0.4,
          extraversion: 0.5,
          agreeableness: 0.2,
          neuroticism: 0.8,
        },
        {
          type: "BehaviorDecisionState" as const,
          source: "autonomous",
          decidedAt: 100,
          expiresAt: 850,
          reason: "working-wander",
          lastAutonomousReason: "working-wander",
          lastAutonomousAt: 100,
        },
      ],
    },
    makePet("pet-b", 110, "idle"),
  ]);

  runCollisionBehaviorSystem(store, BOUNDS, createManualClock(200));

  expect(store.getComponent("pet-a", "AgentTaskState")?.status).toBe("working");
  expect(
    store.getComponent("pet-a", "MotionTarget")?.targetPosition,
  ).toBeNull();
  expect(store.getComponent("pet-a", "PendingReaction")).toBeUndefined();
  expect(store.getComponent("pet-a", "BehaviorDecisionState")?.expiresAt).toBe(
    200,
  );
  expect(store.getComponent("pet-a", "PetExpressionState")).toMatchObject({
    source: "collision",
    mood: "confused",
    emote: "exclaim",
    label: "!",
    startedAt: 200,
  });
});

it("working collision expression duration is derived from OCEAN and clamped", () => {
  const irritated = createComponentStore([
    {
      id: "pet-a",
      components: [
        { type: "Transform" as const, position: { x: 100, y: 500 } },
        {
          type: "PhysicsBody" as const,
          shape: "rectangle",
          width: 32,
          height: 38,
        },
        { type: "IntentState" as const, intent: "idle" },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: null,
        },
        { type: "AgentTaskState" as const, status: "working", since: 0 },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 0,
          extraversion: 1,
          agreeableness: 0,
          neuroticism: 1,
        },
      ],
    },
    makePet("pet-b", 110, "idle"),
  ]);

  runCollisionBehaviorSystem(irritated, BOUNDS, createManualClock(1000));

  expect(irritated.getComponent("pet-a", "PetExpressionState")?.expiresAt).toBe(
    1900,
  );

  const steady = createComponentStore([
    {
      id: "pet-a",
      components: [
        { type: "Transform" as const, position: { x: 100, y: 500 } },
        {
          type: "PhysicsBody" as const,
          shape: "rectangle",
          width: 32,
          height: 38,
        },
        { type: "IntentState" as const, intent: "idle" },
        {
          type: "MotionTarget" as const,
          targetEntityId: null,
          targetPosition: null,
        },
        { type: "AgentTaskState" as const, status: "working", since: 0 },
        {
          type: "Personality" as const,
          openness: 0.5,
          conscientiousness: 1,
          extraversion: 0,
          agreeableness: 1,
          neuroticism: 0,
        },
      ],
    },
    makePet("pet-b", 110, "idle"),
  ]);

  runCollisionBehaviorSystem(steady, BOUNDS, createManualClock(1000));

  expect(steady.getComponent("pet-a", "PetExpressionState")?.expiresAt).toBe(
    1350,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/pet-engine
npx vitest run tests/features/behavior/collision-behavior-system.test.ts
```

Expected: FAIL because working collisions still create `PendingReaction` and do not write `PetExpressionState`.

- [ ] **Step 3: Add OCEAN expression helpers**

In `packages/pet-engine/src/features/behavior/systems.ts`, add these helpers near collision score helpers:

```ts
function workingCollisionExpressionDurationMs(
  personality: PersonalityComponent,
): number {
  const duration =
    550 +
    personality.neuroticism * 350 +
    (1 - personality.agreeableness) * 200 +
    personality.extraversion * 100 -
    personality.conscientiousness * 250;
  return Math.round(clamp(duration, 350, 900));
}

function workingCollisionExpression(personality: PersonalityComponent): {
  mood: import("@pets-driven/design-system").PetMood;
  emote: import("@pets-driven/design-system").PetEmoteKind;
  label: string | null;
} {
  if (personality.neuroticism >= 0.65 || personality.agreeableness <= 0.3) {
    return { mood: "confused", emote: "exclaim", label: "!" };
  }

  if (personality.agreeableness >= 0.75 && personality.neuroticism <= 0.35) {
    return { mood: "love", emote: "heart", label: null };
  }

  if (personality.conscientiousness >= 0.75 || personality.neuroticism <= 0.2) {
    return { mood: "working", emote: "none", label: null };
  }

  return { mood: "thinking", emote: "question", label: null };
}
```

- [ ] **Step 4: Implement working collision expression branch**

In `runCollisionBehaviorSystem`, after `if (!collision) continue;` and before `if (isEscapingCollisionFlee(...)) continue;`, insert:

```ts
const agentTask = components.getComponent(entity.id, "AgentTaskState");
if (agentTask?.status === "working") {
  const personality = components.getComponent(entity.id, "Personality");
  if (personality) {
    const expression = workingCollisionExpression(personality);
    components.setComponent(entity.id, {
      type: "PetExpressionState",
      source: "collision",
      ...expression,
      startedAt: now,
      expiresAt: now + workingCollisionExpressionDurationMs(personality),
    });
  }

  components.setComponent(entity.id, {
    type: "MotionTarget" as const,
    targetEntityId: null,
    targetPosition: null,
  });
  components.setComponent(entity.id, {
    type: "IntentState" as const,
    intent: "active",
  });

  const existing = components.getComponent(entity.id, "BehaviorDecisionState");
  if (
    existing &&
    existing.source === "autonomous" &&
    (existing.reason === "working-focus" ||
      existing.reason === "working-wander")
  ) {
    existing.expiresAt = now;
  }

  continue;
}
```

Rationale: `WorkingBehaviorSystem` runs after `CollisionBehaviorSystem`, does not require `IntentState.intent === "idle"`, and will immediately reselect `working-focus` or `working-wander` once the target is cleared and the working claim is expired. The expression overlay remains independent.

- [ ] **Step 5: Run targeted tests**

```bash
cd packages/pet-engine
npx vitest run tests/features/behavior/collision-behavior-system.test.ts tests/features/behavior/working-behavior-system.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full pet-engine suite**

```bash
cd packages/pet-engine
npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
cd packages/pet-engine
npx prettier --write src/features/behavior/systems.ts tests/features/behavior/collision-behavior-system.test.ts
cd ../..
git add packages/pet-engine/src/features/behavior/systems.ts packages/pet-engine/tests/features/behavior/collision-behavior-system.test.ts
git commit -m "[Misc] Show working collision expressions"
```

---

### Task 3: Snapshot and Rendering Projection for PetExpressionState

**Files:**

- Modify: `packages/pet-engine/src/core/world-snapshot.ts`
- Modify: `packages/pet-engine/src/core/create-world.ts`
- Modify: `packages/pet-engine/src/pets/rendering/behavior-token-presentation.ts`
- Modify: `apps/desktop/src/pet-window/pet-window-projection.ts`
- Modify: `packages/pet-engine/tests/core/world-fixtures.test.ts`
- Modify: `apps/desktop/tests/pet-window/pet-window-projection.test.ts`

- [ ] **Step 1: Write failing snapshot test**

In `packages/pet-engine/tests/core/world-fixtures.test.ts`, add a test near other snapshot/presentation tests:

```ts
it("exposes active pet expressions in the snapshot", () => {
  const scenario = createDemoScenario();

  scenario.world.setComponent("pet-a", {
    type: "PetExpressionState",
    source: "collision",
    mood: "confused",
    emote: "exclaim",
    label: "!",
    startedAt: 100,
    expiresAt: 700,
  });

  const pet = scenario.world
    .snapshot()
    .pets.find((entry) => entry.id === "pet-a");

  expect(pet?.expression).toEqual({
    source: "collision",
    mood: "confused",
    emote: "exclaim",
    label: "!",
    startedAt: 100,
    expiresAt: 700,
  });
});
```

- [ ] **Step 2: Write failing desktop projection test**

In `apps/desktop/tests/pet-window/pet-window-projection.test.ts`, add a test near decision emote projection tests:

```ts
it("prefers expression emotes over behavior decision emotes", () => {
  const snapshot = snapshotFixture();
  snapshot.pets[0] = {
    ...snapshot.pets[0],
    decision: {
      source: "autonomous",
      reason: "working-wander",
      decidedAt: 100,
    },
    agentTask: { status: "working", label: null },
    expression: {
      source: "collision",
      mood: "confused",
      emote: "exclaim",
      label: "!",
      startedAt: 120,
      expiresAt: 820,
    },
    visualCue: null,
  };

  const [projection] = projectWorldSnapshotToPetWindows(
    snapshot,
    { x: 0, y: 0, width: 1000, height: 800 },
    7,
  );

  expect(projection.frame.sprite.decisionEmote).toEqual({
    emote: "exclaim",
    label: "!",
    mood: "confused",
    tone: "alert",
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/pet-engine
npx vitest run tests/core/world-fixtures.test.ts
cd ../../apps/desktop
npx vitest run tests/pet-window/pet-window-projection.test.ts
```

Expected: FAIL because snapshots do not expose `expression` and projection does not prefer expression emotes.

- [ ] **Step 4: Add expression snapshot type and populate it**

In `packages/pet-engine/src/core/world-snapshot.ts`, add:

```ts
export type PetExpressionSnapshot = {
  source: "collision";
  mood: import("@pets-driven/design-system").PetMood;
  emote: import("@pets-driven/design-system").PetEmoteKind;
  label: string | null;
  startedAt: number;
  expiresAt: number;
};
```

Add this field to `PetSnapshot`:

```ts
/** Active visual-only expression overlay, or null when quiet. */
expression?: PetExpressionSnapshot | null;
```

In `packages/pet-engine/src/core/create-world.ts`, inside `getPetSnapshots`, read:

```ts
const expression = componentStore.getComponent(entity.id, "PetExpressionState");
```

Add to the returned pet snapshot:

```ts
expression: expression
  ? {
      source: expression.source,
      mood: expression.mood,
      emote: expression.emote,
      label: expression.label,
      startedAt: expression.startedAt,
      expiresAt: expression.expiresAt,
    }
  : null,
```

- [ ] **Step 5: Add expression presentation helper**

In `packages/pet-engine/src/pets/rendering/behavior-token-presentation.ts`, import the snapshot type:

```ts
import type { PetExpressionSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
```

Add:

```ts
function toneFromExpressionMood(mood: PetMood): BehaviorTokenTone {
  switch (mood) {
    case "love":
      return "affection";
    case "confused":
      return "alert";
    case "thinking":
      return "curious";
    case "excited":
      return "spark";
    case "sleepy":
      return "calm";
    case "working":
    case "happy":
    default:
      return "calm";
  }
}

export function presentPetExpression(
  expression: PetExpressionSnapshot | null | undefined,
): BehaviorTokenPresentation | null {
  if (!expression) return null;
  if (expression.emote === "none") return null;
  return {
    emote: expression.emote,
    label: expression.label ?? "Pet expression",
    mood: expression.mood,
    tone: toneFromExpressionMood(expression.mood),
  };
}
```

- [ ] **Step 6: Prefer expression in desktop projection**

In `apps/desktop/src/pet-window/pet-window-projection.ts`, change the import:

```ts
import {
  presentBehaviorDecisionToken,
  presentPetExpression,
} from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
```

Change the sprite projection:

```ts
sprite: {
  decisionEmote:
    presentPetExpression(pet.expression) ??
    presentBehaviorDecisionToken(pet.decision?.reason),
  intent: spriteIntentFromBody(body),
},
```

- [ ] **Step 7: Run targeted tests**

```bash
cd packages/pet-engine
npx vitest run tests/core/world-fixtures.test.ts
cd ../../apps/desktop
npx vitest run tests/pet-window/pet-window-projection.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run full relevant suites**

```bash
cd packages/pet-engine
npx vitest run
cd ../../apps/desktop
npx vitest run tests/pet-window/pet-window-projection.test.ts
```

Expected: PASS.

- [ ] **Step 9: Format and commit**

```bash
cd packages/pet-engine
npx prettier --write src/core/world-snapshot.ts src/core/create-world.ts src/pets/rendering/behavior-token-presentation.ts tests/core/world-fixtures.test.ts
cd ../../apps/desktop
npx prettier --write src/pet-window/pet-window-projection.ts tests/pet-window/pet-window-projection.test.ts
cd ../..
git add packages/pet-engine/src/core/world-snapshot.ts packages/pet-engine/src/core/create-world.ts packages/pet-engine/src/pets/rendering/behavior-token-presentation.ts packages/pet-engine/tests/core/world-fixtures.test.ts apps/desktop/src/pet-window/pet-window-projection.ts apps/desktop/tests/pet-window/pet-window-projection.test.ts
git commit -m "[Misc] Project pet expressions to window emotes"
```

---

### Task 4: Integration Regression for Collision -> Expression -> Working Reselection

**Files:**

- Modify: `packages/pet-engine/tests/features/behavior/working-behavior-system.test.ts`
- Modify: `packages/pet-engine/tests/features/behavior/collision-behavior-system.test.ts`

- [ ] **Step 1: Write failing integration-style test**

Add to `packages/pet-engine/tests/features/behavior/working-behavior-system.test.ts`:

```ts
it("can reselect working behavior after a working collision expression is written", () => {
  const store = makeStore({
    status: "working",
    conscientiousness: 0.85,
    extraversion: 0.45,
    existingClaim: { source: "autonomous", expiresAt: 100 },
  });
  store.setComponent("pet", {
    type: "PetExpressionState",
    source: "collision",
    mood: "confused",
    emote: "exclaim",
    label: "!",
    startedAt: 100,
    expiresAt: 700,
  });

  runWorkingBehaviorSystem(
    store,
    createManualClock(100),
    createSeededRandom(42),
    BOUNDS,
  );

  expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
    "working-focus",
  );
  expect(store.getComponent("pet", "PetExpressionState")?.label).toBe("!");
});
```

This verifies that an active expression overlay does not block working sub-behavior reselection.

- [ ] **Step 2: Run test to verify it fails if Task 2 or Task 3 is incomplete**

```bash
cd packages/pet-engine
npx vitest run tests/features/behavior/working-behavior-system.test.ts
```

Expected after Tasks 1-3: PASS. If it fails, fix the expression/working interaction before continuing.

- [ ] **Step 3: Run full pet-engine suite**

```bash
cd packages/pet-engine
npx vitest run
```

Expected: PASS.

- [ ] **Step 4: Format and commit**

```bash
cd packages/pet-engine
npx prettier --write tests/features/behavior/working-behavior-system.test.ts tests/features/behavior/collision-behavior-system.test.ts
cd ../..
git add packages/pet-engine/tests/features/behavior/working-behavior-system.test.ts packages/pet-engine/tests/features/behavior/collision-behavior-system.test.ts
git commit -m "[Misc] Cover working collision expression reselection"
```

---

## Final Verification

- [ ] Run pet-engine full suite:

```bash
cd packages/pet-engine
npx vitest run
```

Expected: all tests pass.

- [ ] Run desktop projection test:

```bash
cd apps/desktop
npx vitest run tests/pet-window/pet-window-projection.test.ts
```

Expected: all tests pass.

- [ ] Check git status:

```bash
git status --short
```

Expected: only unrelated pre-existing user changes remain outside the files touched by this plan.
