# Perception/Decision/Planning Separation + OCEAN Personality System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each phase is self-contained — pick one and execute end-to-end (TDD red→green→commit). Do not skip ahead; later phases assume earlier ones landed.

**Goal:** Build the personality-driven behavior selection that is the *core* of this service. Pets express OCEAN (Big-Five) traits as numerical components; those traits drive (1) probabilistic decision-making via Boltzmann/softmax sampling, (2) reaction latency (slow/fast deliberation), (3) collision reactions, (4) movement speed, (5) speech frequency, (6) wander radius. The current 4-axis `BehaviorPreference` is a placeholder and gets fully replaced.

Before the personality work itself, we tighten the architecture into a clear **Perception → Decision → Planning → Execution** pipeline (Phase 0). Without this, personality logic would smear across multiple systems; with it, personality concentrates in the Decision step and the rest stays personality-agnostic.

**Why this is core:** The probabilistic selection + latency variation is what makes pets *appear alive*. A deterministic argmax gives a procedurally-correct but lifeless pet. Softmax sampling + personality-derived delays are the difference between a state machine and a character.

**Tech stack:** TypeScript, Vitest, seeded random, React playground. No new runtime deps.

---

## Current State (as of plan authoring)

- ECS pipeline with 5 phases (PRE_UPDATE / BEHAVIOR / UPDATE / POST_UPDATE / SIMULATE).
- `phases.ts` holds descriptor references; `create-world.ts` consumes `STEP_SYSTEMS` directly. Type-safe ordering.
- `BehaviorSelectionSystem` picks behavior via argmax + tiny jitter, reading `BehaviorPreference` (4 axes: curiosity/sociability/playfulness/shyness).
- Personality factories (`createPlayfulPersonality` etc.) build `PetPersonality` objects with speed, idleConversationMs, completionIntent, and the 4 axes.
- 6 behavior candidates: `wander-near`, `wander-far`, `seek-user`, `request-jump`, `request-climb`, `idle-stay`.
- `CollisionBehaviorSystem` writes `MotionTarget` directly when overlap is detected. No latency.
- 4 demo pets: Alice (playful), Bob (attentive), Charlie (climber-playful), Dana (reserved-flying).

---

## End-State Architecture (after Phase 6)

### Pipeline

```
PRE_UPDATE
  PhysicsTransformSyncSystemPre
  ContactSystem
  PerceptionSystem            ← NEW (Phase 0.1)

BEHAVIOR
  UserInteractionBehaviorSystem
  AgentEventBehaviorSystem    (may write PendingReaction)
  CollisionBehaviorSystem     (writes PendingReaction; reflex path)
  BehaviorDecisionSystem      ← RENAMED from BehaviorSelectionSystem; emits Decision token
  AutonomousBehaviorSystem    (idle speech)
  BehaviorPlanningSystem      ← NEW (Phase 0.2); materializes Decision token

UPDATE (unchanged ordering)
  LocomotionModeSystem, ClimbApproachSystem, ArrivalBehaviorSystem,
  ClimbDismountSystem, LocomotionActiveStateSystem, ClimbAttachmentSystem,
  MotionTargetSystem

POST_UPDATE (unchanged)
  WalkSystem, JumpSystem, WallClimbSystem, IntentSteeringSystem, FlightSystem

SIMULATE (unchanged)
  PhysicsIntegrationSystem, PhysicsTransformSyncSystemPost
```

### Components (additions)

| Component | Purpose | Phase |
|---|---|---|
| `Personality` | OCEAN 5-axis numerical traits, 0..1 each | Phase 1 |
| `Perception` | Per-tick aggregate world view (nearby pets, user, climbables, self state) | Phase 0.1 |
| `BehaviorDecisionToken` | Decision output: kind + parameters, awaiting Planning | Phase 0.2 |
| `PendingReaction` | Deliberation timer: `triggeredAt`, `reactsAt`, source, context | Phase 4 |

### Components (removals)

- `BehaviorPreference` — fully deleted in Phase 1.

---

## File Map (cumulative across phases)

```
src/
  core/
    components.ts              (export new component types)
    create-world.ts            (no changes after Phase 0)
    phases.ts                  (add PerceptionSystem, BehaviorPlanningSystem entries)
  features/
    perception/                ← NEW directory (Phase 0.1)
      components.ts            (PerceptionComponent)
      systems.ts               (runPerceptionSystem + descriptor)
    behavior/
      components.ts            (DecisionToken, PendingReaction, Personality types;
                                delete BehaviorPreference)
      systems.ts               (DecisionSystem, PlanningSystem; Personality reads)
    movement/
      systems.ts               (MotionTargetSystem reads Perception)
  pets/
    personalities/
      factories.ts             (factories emit OCEAN; speed/idleMs optional)
    profiles/
      pet-profile.ts           (no change)
tests/
  features/
    perception/
      perception-system.test.ts                ← NEW (Phase 0.1)
    behavior/
      behavior-decision-system.test.ts         ← RENAMED + updated (Phase 0.2 → Phase 2)
      behavior-planning-system.test.ts         ← NEW (Phase 0.2)
      collision-behavior-system.test.ts        (updated Phase 4)
      pending-reaction.test.ts                 ← NEW (Phase 4)
    movement/                  (existing tests update where they relied on direct mutation)
  pets/
    personalities.test.ts      (OCEAN axis assertions, Phase 1)
```

---

## Phase 0.1 — PerceptionSystem

Aggregate the world view for each pet into a single `Perception` component so downstream systems read once instead of re-querying.

### Tasks

**Files:**
- Create: `src/features/perception/components.ts`
- Create: `src/features/perception/systems.ts`
- Create: `tests/features/perception/perception-system.test.ts`
- Modify: `src/core/components.ts` (re-export `PerceptionComponent`, add to `SimulationComponent` union)
- Modify: `src/core/phases.ts` (insert PerceptionSystem after ContactSystem)
- Modify: `src/core/scenario-fixtures.ts` (add empty `Perception` component to each pet's default components)
- Modify: `src/features/movement/systems.ts` — `runMotionTargetSystem` reads `Perception.userAnchor` instead of querying `UserAnchor` directly
- Modify: `src/features/behavior/systems.ts` — `runBehaviorSelectionSystem` reads `Perception.nearbyClimbables` / `userAnchor` (Phase 0.2 will rename it)

- [ ] **Step 1: Write failing test for PerceptionSystem**

```ts
// tests/features/perception/perception-system.test.ts
describe("PerceptionSystem", () => {
  it("aggregates user anchor, nearby pets, and climbable surfaces per pet", () => {
    const store = createComponentStore([
      { id: "user-anchor", components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: 480, y: 500 } },
      ]},
      { id: "wall", components: [
        { type: "ClimbableSurface" },
        { type: "Transform", position: { x: 280, y: 200 } },
      ]},
      { id: "pet-a", components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "Perception", nearbyPets: [], userAnchor: null,
          nearbyClimbables: [], self: { grounded: false, climbing: false, intent: "idle" } },
        { type: "IntentState", intent: "idle" },
        { type: "ContactState", grounded: true, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "PetIdentity", name: "A" },
        { type: "AgentBinding", sourceId: "agent-a" },
      ]},
      { id: "pet-b", components: [
        { type: "Transform", position: { x: 220, y: 200 } },
        { type: "Perception", nearbyPets: [], userAnchor: null,
          nearbyClimbables: [], self: { grounded: false, climbing: false, intent: "idle" } },
        { type: "IntentState", intent: "idle" },
        { type: "ContactState", grounded: true, climbableSurfaceId: null, climbableSurfacePosition: null },
        { type: "PetIdentity", name: "B" },
        { type: "AgentBinding", sourceId: "agent-b" },
      ]},
    ]);

    runPerceptionSystem(store);

    const perceptionA = store.getComponent("pet-a", "Perception");
    expect(perceptionA?.userAnchor?.id).toBe("user-anchor");
    expect(perceptionA?.userAnchor?.distance).toBeCloseTo(Math.hypot(280, 300), 0);
    expect(perceptionA?.nearbyPets).toHaveLength(1);
    expect(perceptionA?.nearbyPets[0].id).toBe("pet-b");
    expect(perceptionA?.nearbyPets[0].distance).toBeCloseTo(20, 0);
    expect(perceptionA?.nearbyClimbables).toHaveLength(1);
    expect(perceptionA?.self.grounded).toBe(true);
    expect(perceptionA?.self.intent).toBe("idle");
  });

  it("sorts nearbyPets and nearbyClimbables by ascending distance", () => { /* ... */ });
  it("ignores pets and surfaces beyond MAX_PERCEPTION_RANGE", () => { /* ... */ });
  it("treats userAnchor as null if no UserAnchor entity exists", () => { /* ... */ });
});
```

- [ ] **Step 2: Run test to verify RED**

- [ ] **Step 3: Implement `PerceptionComponent`**

```ts
// src/features/perception/components.ts
export type PerceivedEntity = {
  id: string;
  position: { x: number; y: number };
  distance: number; // sqrt-evaluated; small N so cost is negligible
};

export type PerceptionComponent = {
  type: "Perception";
  userAnchor: PerceivedEntity | null;
  nearbyPets: PerceivedEntity[];      // sorted ascending by distance
  nearbyClimbables: PerceivedEntity[]; // sorted ascending by distance
  self: {
    grounded: boolean;
    climbing: boolean;
    intent: PetIntent;
  };
};
```

- [ ] **Step 4: Implement `runPerceptionSystem`**

```ts
const MAX_PERCEPTION_RANGE = 400; // px

export function runPerceptionSystem(components: ComponentStore): void {
  // Pass 1: collect anchors / climbables / other-pet positions once
  let userAnchor: { id: string; x: number; y: number } | null = null;
  components.query(["UserAnchor", "Transform"], (id, [, t]) => {
    if (!userAnchor) userAnchor = { id, x: t.position.x, y: t.position.y };
  });

  const climbables: { id: string; x: number; y: number }[] = [];
  components.query(["ClimbableSurface", "Transform"], (id, [, t]) => {
    climbables.push({ id, x: t.position.x, y: t.position.y });
  });

  const pets: { id: string; x: number; y: number }[] = [];
  components.query(["PetIdentity", "Transform"], (id, [, t]) => {
    pets.push({ id, x: t.position.x, y: t.position.y });
  });

  // Pass 2: build each pet's perception
  components.query(
    ["Perception", "Transform", "IntentState", "ContactState"],
    (id, [perception, transform, intent, contact]) => {
      const px = transform.position.x, py = transform.position.y;

      perception.userAnchor = userAnchor
        ? buildEntry(userAnchor.id, userAnchor.x, userAnchor.y, px, py)
        : null;

      perception.nearbyPets = pets
        .filter((p) => p.id !== id)
        .map((p) => buildEntry(p.id, p.x, p.y, px, py))
        .filter((e) => e.distance <= MAX_PERCEPTION_RANGE)
        .sort((a, b) => a.distance - b.distance);

      perception.nearbyClimbables = climbables
        .map((c) => buildEntry(c.id, c.x, c.y, px, py))
        .filter((e) => e.distance <= MAX_PERCEPTION_RANGE)
        .sort((a, b) => a.distance - b.distance);

      perception.self = {
        grounded: contact.grounded,
        climbing: !!components.getComponent(id, "ClimbingState"),
        intent: intent.intent,
      };
    },
  );
}

function buildEntry(id, ex, ey, px, py) {
  return { id, position: { x: ex, y: ey }, distance: Math.hypot(ex - px, ey - py) };
}
```

- [ ] **Step 5: Add system descriptor + register in phases.ts**

PerceptionSystem runs in PRE_UPDATE after ContactSystem (so `self.grounded` is fresh).

- [ ] **Step 6: Migrate consumers**

- `runMotionTargetSystem`: replace `components.query(["Transform", "UserAnchor"], ...)` with reading `Perception.userAnchor` per pet.
- `runBehaviorSelectionSystem`'s `nearestClimbableSurface` helper: read from `Perception.nearbyClimbables[0]` instead of querying. The 400px cutoff is now uniform via MAX_PERCEPTION_RANGE.
- `runBehaviorSelectionSystem`'s user anchor lookup: read from `Perception.userAnchor`.

After migration, **no behavior system queries `UserAnchor` or `ClimbableSurface` directly** — Perception is the single intermediary.

- [ ] **Step 7: Run all tests; verify GREEN; commit**

```
refactor: introduce PerceptionSystem aggregating per-pet world view

Adds PerceptionComponent and PerceptionSystem in PRE_UPDATE after
ContactSystem. Each pet's Perception now caches user-anchor, nearby
pets, nearby climbables, and self-state. BehaviorSelectionSystem and
MotionTargetSystem read from Perception instead of re-querying the
world. Sets the stage for personality-modulated perception in later
phases.
```

### Review points (Phase 0.1)

1. **No other system queries `UserAnchor` or `ClimbableSurface` directly anymore.** Grep `query.*UserAnchor` and `query.*ClimbableSurface` — should only appear in PerceptionSystem.
2. **PerceptionSystem runs once per tick after ContactSystem** — confirm in `phases.ts` and via systemPlan order assertion.
3. **`nearbyPets` excludes self** — explicit filter `p.id !== id`.
4. **Distances are sorted ascending** — first element is nearest.
5. **Pets get `Perception` component by default** in `scenario-fixtures.ts` `createFixturePet`.
6. **No behavioral change in playground** — Alice/Bob/Charlie/Dana behave identically before/after. The refactor is observably a no-op.
7. **All 141 existing tests still pass**, plus the new Perception tests.

---

## Phase 0.2 — Decision/Planning Split

Separate "what to do" (Decision) from "how to do it" (Planning). After this, `BehaviorDecisionSystem` only emits a token; a new `BehaviorPlanningSystem` materializes the token into concrete components.

### Tasks

**Files:**
- Modify: `src/features/behavior/components.ts` — add `BehaviorDecisionTokenComponent`
- Modify: `src/features/behavior/systems.ts` — rename `runBehaviorSelectionSystem` → `runBehaviorDecisionSystem`; remove `apply()` mutations, emit token instead. Add `runBehaviorPlanningSystem`.
- Modify: `src/core/components.ts` — export `BehaviorDecisionTokenComponent`
- Modify: `src/core/phases.ts` — BehaviorSelectionSystem → BehaviorDecisionSystem; add BehaviorPlanningSystem at end of BEHAVIOR
- Modify: `tests/features/behavior/behavior-selection-system.test.ts` — rename to `behavior-decision-system.test.ts`; update assertions to check token instead of direct components
- Create: `tests/features/behavior/behavior-planning-system.test.ts`

### Decision token shape

```ts
export type BehaviorDecisionKind =
  | "wander-near"
  | "wander-far"
  | "seek-user"
  | "request-jump"
  | "request-climb"
  | "idle-stay";

export type BehaviorDecisionTokenComponent = {
  type: "BehaviorDecisionToken";
  kind: BehaviorDecisionKind;
  decidedAt: number;
  consumed: boolean;
  // Optional parameters carried from Decision to Planning:
  targetPosition?: { x: number; y: number };  // wander-near, wander-far
  targetEntityId?: string;                    // seek-user
  climbSurfaceId?: string;                    // request-climb
  climbTargetY?: number;                      // request-climb
};
```

The token is set by `runBehaviorDecisionSystem` and consumed (`consumed = true`) by `runBehaviorPlanningSystem` the same tick. Stale unconsumed tokens are an invariant violation (Planning must always run after Decision in the same step).

### Tasks

- [ ] **Step 1: Write failing test for split**

```ts
// tests/features/behavior/behavior-decision-system.test.ts
it("emits a decision token but does NOT mutate MotionTarget/JumpActionState/ClimbIntentState", () => {
  const store = makeStore({ sociability: 0.95, shyness: 0.05 }); // existing pref → will translate to OCEAN later
  runBehaviorDecisionSystem(store, createManualClock(0), createSeededRandom(1), { width: 960, height: 540 });

  const token = store.getComponent("pet", "BehaviorDecisionToken");
  expect(token?.kind).toBe("seek-user");

  // Critical: Decision step did NOT plan
  const motion = store.getComponent("pet", "MotionTarget");
  expect(motion?.targetEntityId).toBeNull();
  expect(motion?.targetPosition).toBeNull();
});

// tests/features/behavior/behavior-planning-system.test.ts
it("materializes a seek-user token into MotionTarget pointing at userAnchor", () => {
  const store = /* ... with a fresh token kind="seek-user", targetEntityId="user-anchor" ... */;
  runBehaviorPlanningSystem(store, createManualClock(0));
  const motion = store.getComponent("pet", "MotionTarget");
  expect(motion?.targetEntityId).toBe("user-anchor");
  // and token.consumed === true
});
```

- [ ] **Step 2: Run tests to verify RED**

- [ ] **Step 3: Implement the split**

In `runBehaviorDecisionSystem`:

```ts
// Before (deleted): inline apply closures that wrote MotionTarget/JumpActionState/etc.
// After: each candidate produces parameters; winner writes a token.

type Candidate = {
  kind: BehaviorDecisionKind;
  score: number;
  build(): Omit<BehaviorDecisionTokenComponent, "type" | "decidedAt" | "consumed" | "kind">;
};

// after winner = candidates.reduce(...):
components.setComponent(id, {
  type: "BehaviorDecisionToken",
  kind: winner.kind,
  decidedAt: now,
  consumed: false,
  ...winner.build(),
});
claim(components, id, "autonomous", now, winner.kind);
```

In `runBehaviorPlanningSystem`:

```ts
export function runBehaviorPlanningSystem(components: ComponentStore, clock: Clock): void {
  components.query(["BehaviorDecisionToken"], (id, [token]) => {
    if (token.consumed) return;
    switch (token.kind) {
      case "wander-near":
      case "wander-far":
        components.setComponent(id, {
          type: "MotionTarget", targetEntityId: null,
          targetPosition: token.targetPosition!,
        });
        setIntent(components, id, "active");
        break;
      case "seek-user":
        components.setComponent(id, {
          type: "MotionTarget", targetEntityId: token.targetEntityId ?? null,
          targetPosition: /* userAnchor position from Perception */,
        });
        setIntent(components, id, "seek");
        break;
      case "request-jump":
        // ... set JumpActionState.phase="requested"
        break;
      case "request-climb":
        components.setComponent(id, {
          type: "ClimbIntentState", phase: "approaching",
          surfaceEntityId: token.climbSurfaceId!, targetY: token.climbTargetY!,
        });
        setIntent(components, id, "active");
        break;
      case "idle-stay":
        break; // no-op
    }
    token.consumed = true;
  });
}
```

- [ ] **Step 4: Register Planning system in phases.ts (end of BEHAVIOR)**

- [ ] **Step 5: Update existing tests where they relied on Decision mutating directly**

Particularly `behavior-selection-system.test.ts` checks like `intent?.intent === "seek"` need to become `token?.kind === "seek-user"`. Integration test (the world.step one) needs an extra tick to let Planning run.

Note: in the same tick, Decision → Planning runs, so by the END of the tick everything looks the same as before. Single-step tests that called only `runBehaviorDecisionSystem` will see token instead of mutated components.

- [ ] **Step 6: Run tests, verify GREEN, commit**

```
refactor: split BehaviorSelection into Decision (emit token) + Planning (materialize)

BehaviorDecisionSystem (renamed) now writes BehaviorDecisionToken instead
of mutating MotionTarget/JumpActionState/ClimbIntentState directly. A new
BehaviorPlanningSystem runs at the end of BEHAVIOR phase, reads the token,
and materializes it into the concrete state components.

This isolates "what to do" from "how to do it" so future personality work
can concentrate in Decision without touching Planning's mechanical
translation logic.
```

### Review points (Phase 0.2)

1. **`runBehaviorDecisionSystem` writes EXACTLY one component**: `BehaviorDecisionToken`. Grep its body for `setComponent` calls — there should only be one (token) plus the `claim()` helper call.
2. **`runBehaviorPlanningSystem` writes the appropriate state component per token kind**, then sets `token.consumed = true`.
3. **Phase order**: Decision runs before Autonomous before Planning, all in BEHAVIOR. Confirm via `world.systems()` order.
4. **Token + components stay consistent at the end of a tick** — playground demo pets behave identically before/after.
5. **Test split**: `behavior-decision-system.test.ts` only asserts on tokens; `behavior-planning-system.test.ts` only asserts on materialized components.
6. **No regression**: all existing integration tests pass.

---

## Phase 1 — `Personality` (OCEAN), delete `BehaviorPreference`

Replace the 4-axis preference placeholder with the canonical 5-axis OCEAN model.

### OCEAN axis semantics (binding decisions)

| Axis | Range | Boosts | Reduces |
|---|---|---|---|
| **O**penness | 0..1 | wander-far, request-climb, target radius | (idle-stay) |
| **C**onscientiousness | 0..1 | follow-through (low temperature, see Phase 2) | (changing mind) |
| **E**xtraversion | 0..1 | approach-pet, seek-user, speech freq, move speed | (idle-stay) |
| **A**greeableness | 0..1 | engage on collision, approach-pet | flee-from-pet |
| **N**euroticism | 0..1 | flee-from-pet, decision temperature, reaction-latency, narrow wander | engage |

### Personality recipes (factories)

- **Playful** (was: createPlayfulPersonality) — high O, high E, low N. E=0.85, O=0.7, N=0.1, A=0.5, C=0.4
- **Attentive** (was: createAttentivePersonality) — high E, high A, mid C. E=0.8, A=0.8, C=0.6, O=0.3, N=0.2
- **Reserved** (was: createReservedPersonality) — high N, low E. N=0.75, E=0.2, A=0.4, O=0.3, C=0.5

### Tasks

**Files:**
- Modify: `src/features/behavior/components.ts` — add `PersonalityComponent`; **delete** `BehaviorPreferenceComponent`
- Modify: `src/core/components.ts` — same
- Modify: `src/features/behavior/systems.ts` — score functions rewritten in OCEAN terms; all reads of `BehaviorPreference` → `Personality`
- Modify: `src/features/movement/systems.ts` — `runMotionTargetSystem`'s "skip if has BehaviorPreference" guard becomes "skip if has Personality"
- Modify: `src/core/scenario-fixtures.ts` — fixture pets get `Personality` component
- Modify: `src/pets/personalities/factories.ts` — `PetPersonality` shape: add OCEAN fields; existing `curiosity`/`sociability`/`playfulness`/`shyness` are **removed**
- Modify: `tests/pets/personalities.test.ts` — OCEAN axis assertions
- Modify: `tests/features/behavior/behavior-decision-system.test.ts` — use Personality, not BehaviorPreference

### Score functions (replacing current ones)

```ts
// Higher means more attractive; not bounded but typically 0..2 range.
function scoreWanderNear(p: PersonalityComponent): number {
  return 0.3 + p.openness * 0.1 + p.neuroticism * 0.4;
}
function scoreWanderFar(p: PersonalityComponent): number {
  return 0.3 + p.openness * 0.7 - p.neuroticism * 0.2;
}
function scoreSeekUser(p: PersonalityComponent): number {
  return 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.3 - p.neuroticism * 0.3;
}
function scoreJump(p: PersonalityComponent): number {
  return 0.2 + p.extraversion * 0.4 + p.openness * 0.3;
}
function scoreClimb(p: PersonalityComponent): number {
  return 0.2 + p.openness * 0.6 + p.extraversion * 0.2;
}
function scoreIdleStay(p: PersonalityComponent): number {
  return 0.25 + (1 - p.extraversion) * 0.3 + p.neuroticism * 0.2;
}
```

### Tasks

- [ ] Write failing tests:
  - factory returns OCEAN; no `curiosity`/`sociability`/`playfulness`/`shyness` keys
  - high-E pet picks `seek-user` over `idle-stay`
  - high-N pet picks `wander-near` over `wander-far`
- [ ] Delete `BehaviorPreferenceComponent` everywhere; TS compile error sweep gives a clean checklist of consumers.
- [ ] Wire OCEAN scoring; pass tests.
- [ ] Update playground BehaviorLab `INSPECTED_COMPONENTS` (remove `BehaviorPreference`, add `Personality`).
- [ ] Commit: `feat: replace BehaviorPreference with OCEAN Personality component`

### Review points (Phase 1)

1. **`BehaviorPreference` is fully gone.** Grep — zero hits.
2. **Personality has exactly 5 fields** (openness, conscientiousness, extraversion, agreeableness, neuroticism). No curiosity/sociability/playfulness/shyness anywhere.
3. **Three factory recipes** map to OCEAN as specified above. Test asserts each axis.
4. **Score functions read only Personality** (no MovementProfile / IdleConversation). Each axis's effect is documented in a comment above the function.
5. **Selection is still argmax + jitter** in this phase — Phase 2 introduces softmax. Behavior should still be roughly similar to before the rename (recipes were tuned to preserve character).
6. **All tests pass; build clean.**

---

## Phase 2 — Boltzmann/Softmax Sampling

Replace argmax + jitter with proper softmax sampling. Temperature is personality-derived (N high → high T → more erratic).

### Sampling math

```
T = T_BASE * (1 + ALPHA_T * neuroticism)
  // T_BASE = 0.25, ALPHA_T = 1.2 → T ranges 0.25..0.55

weights[i] = exp(scores[i] / T)
total = Σ weights[i]
r = random.next() * total
cumulative = 0
for each candidate in stable order:
  cumulative += weights[i]
  if cumulative >= r: return candidate
```

`random.next()` is consumed once for sampling (in addition to per-candidate jitter — actually, **remove the per-candidate jitter**; the softmax provides all the stochasticity needed).

### Tasks

**Files:**
- Modify: `src/features/behavior/systems.ts` — replace `candidates.reduce(...)` selection with softmax sample.
- Modify: `tests/features/behavior/behavior-decision-system.test.ts` — add sampling tests.

- [ ] Write failing tests:
  - Same seed → same decision (deterministic).
  - With many samples (loop 1000x with fresh randoms), distribution within ±5% of theoretical softmax probability.
  - Higher N → more variance (verify by checking entropy of choices across 100 samples with same scores).
- [ ] Implement softmax sampling.
- [ ] Remove per-candidate `+ random.next() * 0.05` jitter.
- [ ] Commit: `feat: switch BehaviorDecisionSystem to Boltzmann softmax sampling`

### Review points (Phase 2)

1. **Deterministic given the seed** — repeat 100 runs with `createSeededRandom(42)` → identical outcomes.
2. **Per-candidate jitter is gone** — grep `random.next()` inside score functions, should be zero.
3. **Single `random.next()` call per selection** — count the calls in one pet, one tick.
4. **High-N pets visibly more erratic in the playground** — Dana (N=0.75) flips decisions more often than Alice (N=0.1).
5. **Distribution test** (the 1000-sample one) is included and passing — this is the key behavioral correctness check.

---

## Phase 3 — `approach-pet` / `flee-from-pet` Candidates

Two new behaviors built on `Perception.nearbyPets`.

### Tasks

**Files:**
- Modify: `src/features/behavior/components.ts` — add `"approach-pet"` and `"flee-from-pet"` to `BehaviorDecisionKind` union.
- Modify: `src/features/behavior/systems.ts` — two new candidates in DecisionSystem; PlanningSystem materializes them.

### Score functions

```ts
function scoreApproachPet(p, hasNearby): number {
  if (!hasNearby) return -Infinity; // candidate excluded
  return 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.4 - p.neuroticism * 0.3;
}
function scoreFleeFromPet(p, hasNearby): number {
  if (!hasNearby) return -Infinity;
  return 0.1 + p.neuroticism * 0.7 - p.agreeableness * 0.4;
}
```

### Planning materialization

- `approach-pet`: token carries `targetEntityId = perception.nearbyPets[0].id`; Planning writes MotionTarget pointing at that pet's current position. Intent → "active".
- `flee-from-pet`: token carries `targetPosition` = pet position - normalized(nearestPet - pet) * 200. Bounded to world margins. Intent → "active".

### Tasks

- [ ] Write tests for both candidates: scoring, exclusion when no nearby pets, planning materialization.
- [ ] Test in scenario: place two pets, one high-E high-A → approaches; one high-N low-A → flees.
- [ ] Commit: `feat: add approach-pet and flee-from-pet candidates`

### Review points (Phase 3)

1. **Candidates excluded when `nearbyPets` empty** — score returns `-Infinity` (effectively zero softmax weight after `exp(-inf/T) = 0`).
2. **`approach-pet` materializes to a moving target** — Planning sets MotionTarget to *current* position of nearest pet (not entity-tracked, so it's a snapshot — that's intended; we can revisit if pets become slippery).
3. **`flee-from-pet` direction is away from nearest** — manually verify direction math by inspecting one test's `targetPosition`.
4. **No more direct `query(["PetIdentity", ...])` in Decision** — must go through `Perception.nearbyPets`.
5. **Playground: place pets close together** — high-E pets cluster, high-N pets disperse.

---

## Phase 4 — Collision Personality + Perception/Decision Latency

The big behavioral expressivity step. Two pieces wrapped into one phase because they share `PendingReaction`:

(a) Collision becomes personality-shaped (avoid / engage / flee / unfazed).
(b) Reactions don't happen instantly — pets "think" for a personality-derived duration before committing.

### `PendingReaction` component

```ts
export type ReactionSource = "collision" | "stimulus" | "arrival";

export type PendingReactionComponent = {
  type: "PendingReaction";
  source: ReactionSource;
  triggeredAt: number;
  reactsAt: number;     // when DecisionSystem may consume this
  context: {
    // collision: which entity, where it was
    otherEntityId?: string;
    otherPosition?: { x: number; y: number };
    // stimulus: original event reference if needed
    stimulusType?: string;
  };
};
```

### Reaction latency formula

```ts
// Per-source base latency, modulated by Neuroticism (high N = freezes longer)
// and Extraversion (high E = reacts faster).
function reactionLatencyMs(p: PersonalityComponent, source: ReactionSource): number {
  const baseMs = source === "collision" ? 400 : source === "stimulus" ? 250 : 200;
  const latency = baseMs * (1 + p.neuroticism * 1.5 - p.extraversion * 0.5);
  return Math.max(0, Math.min(2000, latency));
}
```

Examples for collision:
- High-E low-N (Alice-like): 400 * (1 + 0.1*1.5 - 0.85*0.5) = 400 * 0.725 ≈ **290ms** (snappy)
- High-N low-E (Reserved): 400 * (1 + 0.75*1.5 - 0.2*0.5) = 400 * 2.025 ≈ **810ms** (freezes, thinks)
- Mid (Attentive): 400 * (1 + 0.2*1.5 - 0.8*0.5) = 400 * 0.9 ≈ **360ms**

### Collision personality flow

Old `CollisionBehaviorSystem` directly wrote MotionTarget. New flow:

1. Collision detected → write `PendingReaction { source: "collision", context: { otherEntityId, otherPosition } }` with `reactsAt = now + reactionLatencyMs(personality, "collision")`. Claim `collision` priority. **Do NOT modify MotionTarget yet** (pet freezes).
2. While `now < reactsAt`: BehaviorDecisionSystem skips this pet (claim is active). Locomotion sees no new target, so the pet stops moving — visible "freeze".
3. When `now >= reactsAt`: BehaviorDecisionSystem reads the PendingReaction context AND personality, picks one of four collision responses, emits a Decision token, removes PendingReaction.

### Collision response candidates

When PendingReaction.source === "collision", DecisionSystem evaluates a *different* candidate pool than usual:

| Response | Score formula | Planning |
|---|---|---|
| `collision-flee` | `0.2 + N*0.7 - A*0.5` | targetPosition = away from otherPosition |
| `collision-engage` | `0.2 + E*0.5 + A*0.5 - N*0.4` | targetPosition = toward otherPosition (within proximity radius) |
| `collision-avoid` | `0.4 + 0.0` (always plausible) | targetPosition = perpendicular detour around other |
| `collision-unfazed` | `0.15 + (1-N)*0.4` | re-emit previous goal: copy from last non-reactive token if any, else wander-near |

Selection is softmax (same as Phase 2), so even high-N pets occasionally engage and high-E pets occasionally flee — personality is a bias, not a hard rule.

### Tasks

**Files:**
- Modify: `src/features/behavior/components.ts` — add `PendingReactionComponent`, add `collision-*` to `BehaviorDecisionKind`.
- Modify: `src/features/behavior/systems.ts` — `runCollisionBehaviorSystem` rewritten: writes `PendingReaction` + claim. `runBehaviorDecisionSystem` recognizes pets with `PendingReaction` and routes them to the reactive candidate pool.
- Modify: `src/features/behavior/systems.ts` — `runBehaviorPlanningSystem` handles `collision-*` kinds.

- [ ] Write tests:
  - Collision triggers `PendingReaction` with `reactsAt = now + latency`.
  - Pet stays still while `now < reactsAt` (no MotionTarget mutation, no new token).
  - At `reactsAt`, Decision picks a collision-* kind; PendingReaction is removed; Planning materializes.
  - High-N pet picks `collision-flee` more often than `collision-engage` (1000-sample distribution test).
  - High-E low-N pet picks `collision-engage` more often.
- [ ] Implement the changes.
- [ ] Commit: `feat: personality-driven collision reactions with reaction latency`

### Review points (Phase 4)

1. **PendingReaction's `reactsAt` lifecycle**: confirm it's exactly `triggeredAt + reactionLatencyMs(...)` — no fudge factors.
2. **The pet does not move while PendingReaction is unconsumed.** Tick the world 5 times with `now < reactsAt` — `MotionTarget` stays unchanged from collision moment.
3. **Decision pool switches based on `PendingReaction.source`** — `runBehaviorDecisionSystem` has a clear branch: with reaction → reactive pool only; without → normal pool.
4. **All four `collision-*` candidates are reachable** for some personality. Test each with extreme axis values.
5. **Distribution test in place** — see test list above.
6. **Visual confirmation**: in playground with auto-play, force two pets to overlap. Anxious one freezes ~800ms, snappy one reacts ~290ms.
7. **`collision-unfazed`'s "re-emit previous goal" branch**: confirm it correctly copies the *non-reactive* previous token (not the current collision token).

---

## Phase 5 — Speed and Speech Derived from Personality

Factories may explicitly set `MovementProfile.idleSpeed` etc., but if omitted, derive from Personality. Same for `IdleConversation.idleAfterMs`.

### Derivation

```ts
function deriveMovementProfile(p: PersonalityComponent): MovementProfileComponent {
  // High E moves faster; high N moves slower (cautious).
  const energy = 0.6 + p.extraversion * 0.5 - p.neuroticism * 0.2;
  return {
    type: "MovementProfile",
    idleSpeed: 0.0005 * energy,
    activeSpeed: 0.0012 * energy,
    seekSpeed: 0.0018 * energy,
  };
}

function deriveIdleConversation(p: PersonalityComponent): IdleConversationComponent {
  // Talkative scale: high E → short interval. Range ~3s..15s.
  const interval = 14000 - p.extraversion * 11000;
  return { type: "IdleConversation", idleAfterMs: Math.round(interval) };
}
```

### Where derivation happens

In `createFixturePet` (and any future entity-building paths): after the user-supplied component list, if no `MovementProfile` present AND `Personality` present, attach the derived one. Same for `IdleConversation`.

### Tasks

**Files:**
- Modify: `src/core/scenario-fixtures.ts` — apply derivation as a post-processing step in `createFixturePet`.
- Modify: `src/pets/personalities/factories.ts` — `PetPersonality` shape allows `idleSpeed` etc. to be optional. Defaults are derived if missing.
- Create: `tests/pets/personalities-derived.test.ts` — assert derivation.

- [ ] Write tests:
  - Pet with Personality and no MovementProfile gets a derived one with speeds proportional to E.
  - Pet with Personality and explicit MovementProfile keeps the explicit one (override).
  - Same for IdleConversation.
- [ ] Implement derivation.
- [ ] Commit: `feat: derive MovementProfile and IdleConversation from Personality when omitted`

### Review points (Phase 5)

1. **Explicit override wins.** If a factory sets `idleSpeed: 0.001`, the resulting MovementProfile.idleSpeed is exactly 0.001, no recomputation.
2. **No double-attach.** Fixture pets end up with exactly one MovementProfile and one IdleConversation component.
3. **Sensible ranges.** High-E (E=0.9): idleSpeed ~ 0.00055; low-E (E=0.1): ~ 0.00033. Speech interval high-E ~ 4s; low-E ~ 13s.
4. **Derivation is deterministic** — same Personality, same derived values, every run.

---

## Phase 6 — Wander Radius Modulation + Playground Exposure

Final phase: small remaining touchups + make the personality system visible.

### Wander radius

```ts
function wanderRadius(p: PersonalityComponent, range: "near" | "far") {
  if (range === "near") {
    return [60 + p.neuroticism * 20, 140 - p.neuroticism * 60];  // 60..140 → 60..120 (low N) or 80..80 (high N)
  } else {
    return [200 + p.openness * 100, 400 + p.openness * 200];  // wider for high-O
  }
}
```

### Playground UI additions

- `BehaviorLab`: add Personality OCEAN axis bar chart (5 bars).
- `BehaviorLab`: when a `BehaviorDecisionToken` exists, show its kind + recent samples.
- `BehaviorLab`: if `PendingReaction` exists, show countdown to `reactsAt`.
- `ActionTimeline`: include reaction latencies (e.g., "PendingReaction collision → reacts in 810ms").

### Tasks

**Files:**
- Modify: `src/features/behavior/systems.ts` — `pickWanderPosition` reads Personality, uses `wanderRadius` helper.
- Modify: `src/playground/browser/behavior-lab.tsx` — UI additions.
- Modify: `src/playground/browser/playground-app.tsx` — timeline includes PendingReaction events.
- Modify: `tests/smoke/playground-app.test.tsx` — assert Personality panel renders, PendingReaction countdown visible.

- [ ] Write smoke tests for UI presence.
- [ ] Implement.
- [ ] Commit: `feat: surface personality and decision flow in playground BehaviorLab and timeline`

### Review points (Phase 6)

1. **High-N pet's wander-near radii are tighter** — visual: their travel circles are smaller.
2. **High-O pet's wander-far reaches the far edges of the world.**
3. **Playground BehaviorLab shows all 5 OCEAN axes for the selected pet.**
4. **PendingReaction countdown is visible and counts down to zero** before the reaction fires.
5. **Timeline entries are informative** — at least: decision kind, latency, source.

---

## Cross-cutting Review Checklist (apply at every phase)

- [ ] **TDD discipline**: every change starts with a failing test. No code without a test that drove it. Sub-agent's commit should include both.
- [ ] **No phase boundary creep**: e.g. Phase 1 must not touch softmax. Phase 0.1 must not touch personality.
- [ ] **Determinism preserved**: every `random.next()` call counted. Same seed → same trace.
- [ ] **Pipeline integrity**: `world.systems()` order matches `phases.ts`. No orphan/missing systems.
- [ ] **Type safety**: `npm run build` passes. New components added to `SimulationComponent` union.
- [ ] **No regression**: prior test count never goes down; if a test was deleted because the concept disappeared (e.g., BehaviorPreference tests in Phase 1), document why in the commit message.
- [ ] **Performance smell check**: PerceptionSystem allocates per pet per tick. With ≤10 pets this is fine. If list lengths grow, revisit pooling — flag for future, do not optimize early.
- [ ] **Documentation in code**: each personality-influenced score function has a comment naming the axes it reads and how.

---

## Open Design Decisions (flag for human review at each phase)

1. **Should `Perception` include obstacles (Ground)?** Not in Phase 0.1 — only added if a system needs it. Revisit if Phase 3+ needs obstacle-aware steering.
2. **Should `BehaviorDecisionToken` persist between ticks or be ephemeral?** Phase 0.2 makes it ephemeral (`consumed` flag, cleared by Planning). If we need to revoke a decision mid-execution, change to TTL-based.
3. **Reaction latency clamp** (2000ms max) — is that the right ceiling? Easy to tune in Phase 4.
4. **Per-pet softmax temperature** vs **shared world temperature** — Phase 2 picks per-pet (T = base + N). If we ever want "anxiety wave" effects across all pets, revisit.
5. **What happens to `PendingReaction` on stimulus arrival mid-deliberation?** Phase 4 default: stimulus overrides (agent-event priority 2 > collision priority 3). Reaction is dropped. This means high-N pets in a freeze get yanked out by task.started — desired.

---

## Out of Scope (do not implement in this plan)

- Time-of-day or fatigue mechanics
- Personality drift (Personality stays static)
- User-driven pointer/touch interactions (`UserInteractionBehaviorSystem` stays a stub)
- Pet-to-pet speech reactions ("Alice greeted Bob"-style)
- Multi-pet collision (3+ pet pileups) — current pairwise logic suffices
- Persistence / save-load
