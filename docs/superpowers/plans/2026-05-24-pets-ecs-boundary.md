# Pets To ECS Boundary Plan

> **For agentic workers:** Implement this plan task-by-task. Keep `src/pets` as a plain product/domain model and keep ECS component construction inside `src/core`.

**Goal:** Close the boundary leak where `src/pets` knows about ECS component types. Pet profiles and personality presets should stay plain data. The simulation core should own the translation from pet data into ECS components and entity definitions.

**Current issue:** `src/pets/entity-builder.ts` imports `SimulationComponent` from `src/core/components`. This means the pets layer still depends on ECS internals even though `PetProfile` and `PetPersonality` have already been converted to plain data.

**Desired boundary:**

```text
Allowed:
  core -> pets
  playground debug -> core ECS inspection APIs
  features -> core component store

Not allowed:
  pets -> core components
  pets -> core component-store
  adapters -> core ECS component types
  general React UI -> core ECS component types
```

**Architecture rule:** `src/pets` describes what a pet is. `src/core` decides how that pet becomes simulation runtime state.

---

## File Map

```text
src/
  pets/
    profiles/
      pet-profile.ts              # keep plain profile data
    personalities/
      factories.ts                # keep plain personality data
    entity-builder.ts             # remove or turn into non-ECS helper
  core/
    pet-entity-builder.ts         # new ECS conversion owner
    scenario-fixtures.ts          # import core builder if fixture pets use profiles later
    components.ts                 # unchanged aggregate ECS component type
  playground/
    browser/
      behavior-lab.tsx            # allowed ECS debug exception
tests/
  pets/
    pet-contracts.test.ts         # assert pets are plain data
  core/
    pet-entity-builder.test.ts    # assert profile/personality -> ECS components
```

---

## Task 1: Add Boundary Tests

**Files:**
- Modify: `tests/pets/pet-contracts.test.ts`
- Add: `tests/core/pet-entity-builder.test.ts`

- [ ] Add a pets contract test that verifies personality factories return plain data, not component arrays.
- [ ] Add a pets contract test that verifies `PetProfile` stores `personality`, not `components`.
- [ ] Add a core builder test that converts `PetPersonality` into:
  - `MovementProfile`
  - optional `IdleConversation`
  - `CompletionBehavior`
- [ ] Add a static boundary test or simple import grep test if useful:
  - `src/pets` must not import `@/core/components`
  - `src/pets` must not import `@/core/component-store`

Suggested assertion:

```ts
expect(createPlayfulPersonality()).toEqual({
  idleSpeed: 0.0008,
  activeSpeed: 0.0016,
  seekSpeed: 0.002,
  idleConversationMs: 9000,
  completionIntent: "seek",
});
```

---

## Task 2: Move ECS Conversion Into Core

**Files:**
- Add: `src/core/pet-entity-builder.ts`
- Delete or empty: `src/pets/entity-builder.ts`
- Modify imports in tests and any callers

Move this responsibility:

```text
src/pets/entity-builder.ts
```

to:

```text
src/core/pet-entity-builder.ts
```

The core builder can import both sides:

```ts
import type { SimulationComponent } from "@/core/components";
import type { PetPersonality } from "@/pets/personalities/factories";
```

That dependency direction is acceptable because core owns runtime construction.

Initial API:

```ts
export function buildPersonalityComponents(
  personality: PetPersonality,
): SimulationComponent[];
```

Optional future API:

```ts
export function buildPetEntityDefinition(
  profile: PetProfile,
  input: {
    entityId: string;
    sourceId: string;
    name: string;
    position: { x: number; y: number };
  },
): EntityDeclaration;
```

Do not add the future API unless the current code has an immediate caller.

---

## Task 3: Remove ECS Imports From Pets

**Files:**
- Modify: `src/pets/profiles/pet-profile.ts`
- Modify: `src/pets/personalities/factories.ts`
- Delete or relocate: `src/pets/entity-builder.ts`

Final `src/pets` rule:

```text
No imports from:
  @/core/components
  @/core/component-store
  @/core/create-world
  @/features/*
```

Allowed imports:

```text
@/pets/*
plain shared utility types, if needed
```

`PetProfile` should remain plain:

```ts
export type PetProfile = {
  id: string;
  petAssetId: string;
  personality: PetPersonality;
};
```

`PetPersonality` should remain plain:

```ts
export type PetPersonality = {
  idleSpeed: number;
  activeSpeed: number;
  seekSpeed: number;
  idleConversationMs?: number;
  completionIntent: "idle" | "seek";
};
```

---

## Task 4: Update Tests And Imports

**Files:**
- Modify: `tests/pets/pet-contracts.test.ts`
- Add or modify: `tests/core/pet-entity-builder.test.ts`

Update old imports:

```ts
import { buildPersonalityComponents } from "@/pets/entity-builder";
```

to:

```ts
import { buildPersonalityComponents } from "@/core/pet-entity-builder";
```

Keep `tests/pets/*` focused on public pet contracts. Keep ECS output assertions in `tests/core/*`.

---

## Task 5: Verify Boundary And Runtime

Run:

```text
npm.cmd test
npm.cmd run build
```

Also run:

```text
rg -n "core/components|core/component-store|features/" src/pets
```

Expected result:

```text
no matches
```

---

## Acceptance Criteria

- `src/pets` has no imports from `src/core` ECS modules.
- `PetProfile` and `PetPersonality` remain plain serializable data shapes.
- ECS conversion lives in `src/core`.
- Playground debug inspection can still use ECS types.
- All tests pass.
- Build passes.

---

## Follow-Up

After this boundary is closed, the next behavior work can add richer personality fields without forcing `src/pets` to know ECS component names. For example:

```ts
type PetPersonality = {
  movement: {
    idleSpeed: number;
    activeSpeed: number;
    seekSpeed: number;
  };
  sociality: number;
  curiosity: number;
  collisionStyle: "avoidant" | "bold" | "social" | "nervous";
};
```

The core builder can then decide which ECS components those product-level traits create.
