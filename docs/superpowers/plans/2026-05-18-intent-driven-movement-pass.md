# Intent-Driven Movement Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `idle`, `active`, and `seek-user` visibly different in space by adding targetable world entities, pet-owned movement profiles, deterministic target resolution, and force-based steering integrated with existing separation logic.

**Architecture:** Keep targets in the world, movement tuning on each pet, and motion decisions in focused systems. Each world step resolves a target from intent, computes steering plus separation, applies the combined force to Matter.js, then exposes the updated motion through existing snapshots.

**Tech Stack:** TypeScript, Vitest, Matter.js, seedable random utilities, React playground

---

## File Map

```text
src/
  core/
    entities/
      world-entity.ts
    systems/
      motion-target-system.ts
      intent-steering-system.ts
      separation-steering-system.ts
    world/
      create-world.ts
      scenario-fixtures.ts
tests/
  core/
    motion-target-system.test.ts
    intent-steering-system.test.ts
    world-fixtures.test.ts
```

### Task 1: Add world entities and pet movement state

**Files:**
- Create: `src/core/entities/world-entity.ts`
- Modify: `src/core/world/create-world.ts`
- Modify: `src/core/world/scenario-fixtures.ts`
- Test: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("creates a configurable user anchor entity", () => {
  const scenario = createDemoScenario({
    userAnchor: { x: 480, y: 500 },
  });

  expect(scenario.world.getEntity("user-anchor")).toEqual({
    id: "user-anchor",
    kind: "user-anchor",
    position: { x: 480, y: 500 },
  });
});

it("gives fixture pets movement profiles and motion state", () => {
  const scenario = createDemoScenario();
  const pet = scenario.world.getPet("pet-a");

  expect(pet?.movement).toEqual({
    idleSpeed: 0.0006,
    activeSpeed: 0.0012,
    seekUserSpeed: 0.0018,
  });
  expect(pet?.runtime.motion).toEqual({
    targetEntityId: null,
    targetPosition: null,
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd test -- tests/core/world-fixtures.test.ts`

Expected: FAIL because world entities and pet movement state do not exist yet.

- [ ] **Step 3: Implement the world entity model**

```ts
// src/core/entities/world-entity.ts
export type WorldEntity = {
  id: string;
  kind: "user-anchor";
  position: {
    x: number;
    y: number;
  };
};
```

- [ ] **Step 4: Extend world and fixtures**

```ts
// create-world.ts additions
export type RuntimePet = {
  ...
  movement: {
    idleSpeed: number;
    activeSpeed: number;
    seekUserSpeed: number;
  };
  runtime: {
    ...
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
};
```

```ts
export function createWorld(input: {
  width: number;
  height: number;
  clock: ManualClock;
  pets: RuntimePet[];
  entities: WorldEntity[];
}) {
  ...
  return {
    getEntity(id: string) {
      return input.entities.find((entity) => entity.id === id);
    },
    ...
  };
}
```

```ts
// scenario-fixtures.ts additions
export function createDemoScenario(options?: {
  userAnchor?: { x: number; y: number };
}) {
  ...
  entities: [
    {
      id: "user-anchor",
      kind: "user-anchor",
      position: options?.userAnchor ?? { x: 480, y: 500 },
    },
  ],
  pets: [
    {
      ...
      movement: {
        idleSpeed: 0.0006,
        activeSpeed: 0.0012,
        seekUserSpeed: 0.0018,
      },
      runtime: {
        ...,
        motion: {
          targetEntityId: null,
          targetPosition: null,
        },
      },
    },
  ]
}
```

- [ ] **Step 5: Run tests to verify GREEN**

Run: `npm.cmd test -- tests/core/world-fixtures.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/entities src/core/world tests/core/world-fixtures.test.ts
git commit -m "feat: add targetable world entities"
```

### Task 2: Resolve motion targets from intent

**Files:**
- Create: `src/core/systems/motion-target-system.ts`
- Test: `tests/core/motion-target-system.test.ts`

- [ ] **Step 1: Write failing target-resolution tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveMotionTargets } from "@/core/systems/motion-target-system";

describe("motion target system", () => {
  it("targets the user anchor for seek-user pets", () => {
    const pet = createPet("seek-user");
    resolveMotionTargets(
      [pet],
      [{ id: "user-anchor", kind: "user-anchor", position: { x: 480, y: 500 } }],
      { next: () => 0.5 },
      { width: 960, height: 540 },
    );

    expect(pet.runtime.motion).toEqual({
      targetEntityId: "user-anchor",
      targetPosition: { x: 480, y: 500 },
    });
  });

  it("chooses deterministic waypoints for idle pets", () => {
    const pet = createPet("idle");
    resolveMotionTargets([pet], [], { next: () => 0.25 }, { width: 960, height: 540 });

    expect(pet.runtime.motion).toEqual({
      targetEntityId: null,
      targetPosition: { x: 240, y: 135 },
    });
  });

  it("chooses deterministic waypoints for active pets", () => {
    const pet = createPet("active");
    resolveMotionTargets([pet], [], { next: () => 0.75 }, { width: 960, height: 540 });

    expect(pet.runtime.motion).toEqual({
      targetEntityId: null,
      targetPosition: { x: 720, y: 405 },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd test -- tests/core/motion-target-system.test.ts`

Expected: FAIL because the system does not exist.

- [ ] **Step 3: Implement target resolution**

```ts
import type { WorldEntity } from "@/core/entities/world-entity";
import type { RandomSource } from "@/shared/random/seeded-random";

type MotionPet = {
  runtime: {
    intent: string;
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
};

export function resolveMotionTargets(
  pets: MotionPet[],
  entities: WorldEntity[],
  random: RandomSource,
  bounds: { width: number; height: number },
) {
  for (const pet of pets) {
    if (pet.runtime.intent === "seek-user") {
      const anchor = entities.find((entity) => entity.kind === "user-anchor");
      pet.runtime.motion = {
        targetEntityId: anchor?.id ?? null,
        targetPosition: anchor?.position ?? null,
      };
      continue;
    }

    if (!pet.runtime.motion.targetPosition) {
      pet.runtime.motion = {
        targetEntityId: null,
        targetPosition: {
          x: bounds.width * random.next(),
          y: bounds.height * random.next(),
        },
      };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm.cmd test -- tests/core/motion-target-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/systems/motion-target-system.ts tests/core/motion-target-system.test.ts
git commit -m "feat: resolve motion targets from intent"
```

### Task 3: Compute intent steering and apply movement

**Files:**
- Create: `src/core/systems/intent-steering-system.ts`
- Modify: `src/core/physics/matter-physics-world.ts`
- Modify: `src/core/world/create-world.ts`
- Test: `tests/core/intent-steering-system.test.ts`
- Test: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Write failing steering tests**

```ts
it("uses different movement speeds by intent", () => {
  const forces = computeIntentSteeringForces([
    createSteeringPet("idle", 0.0006),
    createSteeringPet("active", 0.0012),
    createSteeringPet("seek-user", 0.0018),
  ]);

  expect(forces.map((force) => force.x)).toEqual([0.0006, 0.0012, 0.0018]);
});
```

```ts
it("moves seek-user pets toward the user anchor", () => {
  const scenario = createDemoScenario({
    userAnchor: { x: 480, y: 500 },
  });
  const before = scenario.world.snapshot().pets[0].position;

  scenario.world.pushStimulus({
    type: "task.waiting",
    sourceId: "agent-a",
    at: 1,
    summary: "Needs approval",
  });
  for (let i = 0; i < 20; i += 1) {
    scenario.world.step(16);
  }

  const after = scenario.world.snapshot().pets[0].position;
  expect(after.y).toBeGreaterThan(before.y);
});
```

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
npm.cmd test -- tests/core/intent-steering-system.test.ts
npm.cmd test -- tests/core/world-fixtures.test.ts
```

Expected: FAIL because intent steering does not exist yet and world steps do not apply motion forces.

- [ ] **Step 3: Implement force generation**

```ts
export function computeIntentSteeringForces(pets: SteeringPet[]) {
  return pets.map((pet) => {
    const target = pet.runtime.motion.targetPosition;
    if (!target) {
      return { id: pet.id, x: 0, y: 0 };
    }

    const dx = target.x - pet.position.x;
    const dy = target.y - pet.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
      return { id: pet.id, x: 0, y: 0 };
    }

    const speed =
      pet.runtime.intent === "seek-user"
        ? pet.movement.seekUserSpeed
        : pet.runtime.intent === "active"
          ? pet.movement.activeSpeed
          : pet.movement.idleSpeed;

    return {
      id: pet.id,
      x: (dx / distance) * speed,
      y: (dy / distance) * speed,
    };
  });
}
```

- [ ] **Step 4: Connect motion to world stepping**

World step should:

1. read the current physics snapshot
2. resolve targets
3. compute intent forces
4. compute separation forces
5. add matching forces together by id
6. apply combined forces to physics
7. step physics

Add any minimal physics getter needed to expose current body positions to steering without leaking Matter.js internals.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
npm.cmd test -- tests/core/intent-steering-system.test.ts
npm.cmd test -- tests/core/world-fixtures.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/systems/intent-steering-system.ts src/core/physics/matter-physics-world.ts src/core/world/create-world.ts tests/core/intent-steering-system.test.ts tests/core/world-fixtures.test.ts
git commit -m "feat: steer pets from intent"
```

### Task 4: Verify separation participates in actual motion

**Files:**
- Modify: `tests/core/world-fixtures.test.ts`
- Possibly modify: `src/core/world/create-world.ts`

- [ ] **Step 1: Add a failing integration test**

```ts
it("pushes nearby pets apart while stepping the world", () => {
  const scenario = createDemoScenario();
  const before = scenario.world.snapshot().bodies;

  for (let i = 0; i < 20; i += 1) {
    scenario.world.step(16);
  }

  const after = scenario.world.snapshot().bodies;
  const initialDistance = Math.abs(before[1].x - before[0].x);
  const nextDistance = Math.abs(after[1].x - after[0].x);

  expect(nextDistance).toBeGreaterThan(initialDistance);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm.cmd test -- tests/core/world-fixtures.test.ts`

Expected: FAIL if separation is not yet applied during world stepping.

- [ ] **Step 3: Ensure world stepping combines separation forces**

Use the existing `computeSeparationForces` result in the world step, sum it with intent steering per body id, and apply the total force through the physics world.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `npm.cmd test -- tests/core/world-fixtures.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/world/create-world.ts tests/core/world-fixtures.test.ts
git commit -m "feat: apply separation during world steps"
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

- [ ] **Step 4: Visually verify movement in the browser**

Open the browser playground and confirm:

- idle pets move slowly
- waiting event makes Alice head toward the user anchor
- spacing between nearby pets increases over time

- [ ] **Step 5: Commit only if final touch-ups were needed**

If no final touch-ups are needed, do not create an empty commit.
