# pets-driven Simulation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-first, headless pet simulation core with ECS-style composition, deterministic tests, Matter.js-backed physics, and a canvas playground that renders both debug primitives and real pet sprites.

**Architecture:** Keep the simulation core independent from Tauri, Claude, Windows, and pet asset loading. Compose behavior from reusable personality components, translate all outside activity into neutral stimuli, emit renderer-independent snapshots, and let a browser canvas renderer visualize the same world with either fallback debug shapes or optional sprite assets.

**Tech Stack:** TypeScript, React, Vite, Vitest, Matter.js, Playwright, npm

---

## Scope Check

The approved spec is already scoped to one independently shippable subsystem:

- headless simulation core
- reusable personality components and presets
- deterministic browser playground
- debug and sprite canvas rendering

No additional split is needed before implementation.

## Target File Map

```text
package.json
tsconfig.json
vite.config.ts
index.html

src/
  main.tsx
  styles.css

  shared/
    random/
      seeded-random.ts
    time/
      manual-clock.ts

  core/
    ecs/
      entity.ts
      component-registry.ts
    physics/
      matter-physics-world.ts
    snapshots/
      world-snapshot.ts
    stimuli/
      stimulus.ts
      stimulus-queue.ts
    systems/
      idle-conversation-system.ts
      separation-steering-system.ts
      stimulus-reaction-system.ts
    world/
      create-world.ts
      scenario-fixtures.ts

  pets/
    assets/
      pet-asset.ts
      atlas-loader.ts
    profiles/
      pet-profile.ts
    personalities/
      components/
        avoids-crowds.ts
        curious.ts
        seeks-user.ts
        talkative.ts
      presets/
        attentive.json
        playful.json
        reserved.json

  playground/
    browser/
      canvas-renderer.ts
      debug-overlay.ts
      playground-app.tsx
      scenario-controls.tsx

tests/
  smoke/
    playground-app.test.tsx
  shared/
    deterministic-tools.test.ts
  core/
    component-registry.test.ts
    stimulus-queue.test.ts
    physics-world.test.ts
    systems.test.ts
    world-fixtures.test.ts
  pets/
    pet-contracts.test.ts
  playground/
    canvas-renderer.test.ts

e2e/
  playground.spec.ts
```

## Task 1: Scaffold The Browser-First Repository

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/styles.css`
- Create: `src/playground/browser/playground-app.tsx`
- Test: `tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

```tsx
// tests/smoke/playground-app.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaygroundApp } from "../../src/playground/browser/playground-app";

describe("PlaygroundApp", () => {
  it("renders the simulation canvas shell", () => {
    render(<PlaygroundApp />);

    expect(screen.getByRole("heading", { name: "pets-driven playground" })).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add the project tooling files**

```json
// package.json
{
  "name": "pets-driven",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "matter-js": "^0.20.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/matter-js": "^0.19.8",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.4.1",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.3"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests", "e2e", "vite.config.ts"]
}
```

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>pets-driven</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Run the test to verify it fails before the app exists**

Run: `npm install`

Expected: dependencies install successfully.

Run: `npm test -- tests/smoke/playground-app.test.tsx`

Expected: FAIL because `src/playground/browser/playground-app.tsx` does not exist yet.

- [ ] **Step 4: Implement the smallest app shell**

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { PlaygroundApp } from "./playground/browser/playground-app";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PlaygroundApp />
  </React.StrictMode>,
);
```

```tsx
// src/playground/browser/playground-app.tsx
export function PlaygroundApp() {
  return (
    <main className="playground-shell">
      <header>
        <h1>pets-driven playground</h1>
      </header>
      <canvas data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
```

```css
/* src/styles.css */
:root {
  font-family: Inter, Arial, sans-serif;
  color: #172033;
  background: #f5f7fb;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #f5f7fb;
}

.playground-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
  padding: 24px;
  box-sizing: border-box;
}

.playground-shell h1 {
  margin: 0;
  font-size: 1.5rem;
}

.playground-shell canvas {
  width: min(100%, 960px);
  aspect-ratio: 16 / 9;
  border: 1px solid #ccd5e0;
  background: #ffffff;
}
```

- [ ] **Step 5: Run the smoke test and build**

Run: `npm test -- tests/smoke/playground-app.test.tsx`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.tsx src/styles.css src/playground/browser/playground-app.tsx tests/smoke/playground-app.test.tsx
git commit -m "feat: scaffold browser playground"
```

## Task 2: Add Deterministic Time And Randomness

**Files:**
- Create: `src/shared/time/manual-clock.ts`
- Create: `src/shared/random/seeded-random.ts`
- Test: `tests/shared/deterministic-tools.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/shared/deterministic-tools.test.ts
import { describe, expect, it } from "vitest";
import { createManualClock } from "../../src/shared/time/manual-clock";
import { createSeededRandom } from "../../src/shared/random/seeded-random";

describe("deterministic helpers", () => {
  it("advances a manual clock explicitly", () => {
    const clock = createManualClock(1_000);

    clock.advanceBy(250);

    expect(clock.now()).toBe(1_250);
  });

  it("replays the same random sequence from the same seed", () => {
    const first = createSeededRandom(42);
    const second = createSeededRandom(42);

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- tests/shared/deterministic-tools.test.ts`

Expected: FAIL because the helper modules do not exist.

- [ ] **Step 3: Implement the helpers**

```ts
// src/shared/time/manual-clock.ts
export type Clock = {
  now(): number;
};

export type ManualClock = Clock & {
  advanceBy(ms: number): void;
};

export function createManualClock(startAt = 0): ManualClock {
  let currentTime = startAt;

  return {
    now: () => currentTime,
    advanceBy: (ms) => {
      currentTime += ms;
    },
  };
}
```

```ts
// src/shared/random/seeded-random.ts
export type RandomSource = {
  next(): number;
};

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return {
    next() {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/shared/deterministic-tools.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/time/manual-clock.ts src/shared/random/seeded-random.ts tests/shared/deterministic-tools.test.ts
git commit -m "feat: add deterministic time and randomness"
```

## Task 3: Build The ECS Kernel And Component Registry

**Files:**
- Create: `src/core/ecs/entity.ts`
- Create: `src/core/ecs/component-registry.ts`
- Test: `tests/core/component-registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

```ts
// tests/core/component-registry.test.ts
import { describe, expect, it } from "vitest";
import {
  createComponentRegistry,
  type ComponentDefinition,
} from "../../src/core/ecs/component-registry";

type Curious = { type: "Curious"; weight: number };

const curiousDefinition: ComponentDefinition<Curious> = {
  type: "Curious",
  validate(value): value is Curious {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Curious).type === "Curious" &&
      typeof (value as Curious).weight === "number"
    );
  },
};

describe("component registry", () => {
  it("registers and validates known component payloads", () => {
    const registry = createComponentRegistry([curiousDefinition]);

    expect(registry.validate({ type: "Curious", weight: 0.8 })).toBe(true);
    expect(registry.validate({ type: "Curious", weight: "high" })).toBe(false);
  });

  it("rejects unknown component types", () => {
    const registry = createComponentRegistry([curiousDefinition]);

    expect(registry.validate({ type: "Unknown" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/core/component-registry.test.ts`

Expected: FAIL because the ECS files do not exist.

- [ ] **Step 3: Implement entities and registry**

```ts
// src/core/ecs/entity.ts
export type EntityId = string;

export type Entity = {
  id: EntityId;
  components: Map<string, unknown>;
};

export function createEntity(id: EntityId): Entity {
  return {
    id,
    components: new Map(),
  };
}

export function addComponent<T extends { type: string }>(entity: Entity, component: T) {
  entity.components.set(component.type, component);
}

export function getComponent<T>(entity: Entity, type: string): T | undefined {
  return entity.components.get(type) as T | undefined;
}
```

```ts
// src/core/ecs/component-registry.ts
export type ComponentDefinition<T extends { type: string }> = {
  type: T["type"];
  validate(value: unknown): value is T;
};

export type ComponentRegistry = {
  validate(value: unknown): boolean;
  has(type: string): boolean;
};

export function createComponentRegistry(
  definitions: ComponentDefinition<{ type: string }>[],
): ComponentRegistry {
  const definitionsByType = new Map(definitions.map((definition) => [definition.type, definition]));

  return {
    has(type) {
      return definitionsByType.has(type);
    },
    validate(value) {
      if (typeof value !== "object" || value === null || !("type" in value)) {
        return false;
      }

      const type = (value as { type: string }).type;
      const definition = definitionsByType.get(type);
      return definition ? definition.validate(value) : false;
    },
  };
}
```

- [ ] **Step 4: Run the registry tests**

Run: `npm test -- tests/core/component-registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ecs/entity.ts src/core/ecs/component-registry.ts tests/core/component-registry.test.ts
git commit -m "feat: add ecs registry kernel"
```

## Task 4: Define Pet Assets, User Profiles, Components, And Presets

**Files:**
- Create: `src/pets/assets/pet-asset.ts`
- Create: `src/pets/profiles/pet-profile.ts`
- Create: `src/pets/personalities/components/curious.ts`
- Create: `src/pets/personalities/components/talkative.ts`
- Create: `src/pets/personalities/components/avoids-crowds.ts`
- Create: `src/pets/personalities/components/seeks-user.ts`
- Create: `src/pets/personalities/presets/playful.json`
- Create: `src/pets/personalities/presets/attentive.json`
- Create: `src/pets/personalities/presets/reserved.json`
- Test: `tests/pets/pet-contracts.test.ts`

- [ ] **Step 1: Write failing model tests**

```ts
// tests/pets/pet-contracts.test.ts
import { describe, expect, it } from "vitest";
import { isPetAsset } from "../../src/pets/assets/pet-asset";
import { isPetProfile } from "../../src/pets/profiles/pet-profile";
import playfulPreset from "../../src/pets/personalities/presets/playful.json";

describe("pet contracts", () => {
  it("accepts the external hatch-pet manifest shape", () => {
    expect(
      isPetAsset({
        id: "jori",
        displayName: "Jori",
        description: "A tiny helper.",
        spritesheetPath: "spritesheet.webp",
      }),
    ).toBe(true);
  });

  it("keeps user profiles separate from external pet assets", () => {
    expect(
      isPetProfile({
        id: "my-jori",
        petAssetId: "jori",
        components: [{ type: "Talkative", idleAfterMs: 9000 }],
      }),
    ).toBe(true);
  });

  it("ships reusable presets rather than service-owned pet profiles", () => {
    expect(playfulPreset.id).toBe("playful");
    expect(playfulPreset.components.map((component) => component.type)).toContain("Curious");
    expect(playfulPreset).not.toHaveProperty("petAssetId");
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- tests/pets/pet-contracts.test.ts`

Expected: FAIL because the pet contract modules do not exist.

- [ ] **Step 3: Implement the asset and profile contracts**

```ts
// src/pets/assets/pet-asset.ts
export type PetAsset = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

export function isPetAsset(value: unknown): value is PetAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as PetAsset;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.spritesheetPath === "string"
  );
}
```

```ts
// src/pets/profiles/pet-profile.ts
export type PersonalityComponent =
  | { type: "Curious"; weight: number }
  | { type: "Talkative"; idleAfterMs: number }
  | { type: "AvoidsCrowds"; radius: number }
  | { type: "SeeksUser"; distance: number };

export type PetProfile = {
  id: string;
  petAssetId: string;
  components: PersonalityComponent[];
};

export function isPetProfile(value: unknown): value is PetProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as PetProfile;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.petAssetId === "string" &&
    Array.isArray(candidate.components)
  );
}
```

- [ ] **Step 4: Implement built-in personality component definitions**

```ts
// src/pets/personalities/components/curious.ts
export type Curious = { type: "Curious"; weight: number };

export const curiousDefinition = {
  type: "Curious" as const,
  validate(value: unknown): value is Curious {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Curious).type === "Curious" &&
      typeof (value as Curious).weight === "number"
    );
  },
};
```

```ts
// src/pets/personalities/components/talkative.ts
export type Talkative = { type: "Talkative"; idleAfterMs: number };

export const talkativeDefinition = {
  type: "Talkative" as const,
  validate(value: unknown): value is Talkative {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Talkative).type === "Talkative" &&
      typeof (value as Talkative).idleAfterMs === "number"
    );
  },
};
```

```ts
// src/pets/personalities/components/avoids-crowds.ts
export type AvoidsCrowds = { type: "AvoidsCrowds"; radius: number };

export const avoidsCrowdsDefinition = {
  type: "AvoidsCrowds" as const,
  validate(value: unknown): value is AvoidsCrowds {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as AvoidsCrowds).type === "AvoidsCrowds" &&
      typeof (value as AvoidsCrowds).radius === "number"
    );
  },
};
```

```ts
// src/pets/personalities/components/seeks-user.ts
export type SeeksUser = { type: "SeeksUser"; distance: number };

export const seeksUserDefinition = {
  type: "SeeksUser" as const,
  validate(value: unknown): value is SeeksUser {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as SeeksUser).type === "SeeksUser" &&
      typeof (value as SeeksUser).distance === "number"
    );
  },
};
```

- [ ] **Step 5: Add reusable preset JSON files**

```json
// src/pets/personalities/presets/playful.json
{
  "id": "playful",
  "name": "Playful",
  "components": [
    { "type": "Curious", "weight": 0.9 },
    { "type": "Talkative", "idleAfterMs": 9000 }
  ]
}
```

```json
// src/pets/personalities/presets/attentive.json
{
  "id": "attentive",
  "name": "Attentive",
  "components": [
    { "type": "SeeksUser", "distance": 120 },
    { "type": "Talkative", "idleAfterMs": 12000 }
  ]
}
```

```json
// src/pets/personalities/presets/reserved.json
{
  "id": "reserved",
  "name": "Reserved",
  "components": [
    { "type": "AvoidsCrowds", "radius": 96 }
  ]
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- tests/pets/pet-contracts.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pets tests/pets/pet-contracts.test.ts
git commit -m "feat: add pet asset profile and personality contracts"
```

## Task 5: Add Neutral Stimuli And A FIFO Queue

**Files:**
- Create: `src/core/stimuli/stimulus.ts`
- Create: `src/core/stimuli/stimulus-queue.ts`
- Test: `tests/core/stimulus-queue.test.ts`

- [ ] **Step 1: Write failing queue tests**

```ts
// tests/core/stimulus-queue.test.ts
import { describe, expect, it } from "vitest";
import { createStimulusQueue } from "../../src/core/stimuli/stimulus-queue";

describe("stimulus queue", () => {
  it("drains stimuli in insertion order", () => {
    const queue = createStimulusQueue();
    queue.push({ type: "task.started", sourceId: "a", at: 1 });
    queue.push({ type: "task.waiting", sourceId: "a", at: 2, summary: "Needs approval" });

    expect(queue.drain()).toEqual([
      { type: "task.started", sourceId: "a", at: 1 },
      { type: "task.waiting", sourceId: "a", at: 2, summary: "Needs approval" },
    ]);
    expect(queue.drain()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/core/stimulus-queue.test.ts`

Expected: FAIL because the stimulus files do not exist.

- [ ] **Step 3: Implement the neutral stimulus vocabulary and queue**

```ts
// src/core/stimuli/stimulus.ts
export type Stimulus =
  | { type: "task.started"; sourceId: string; at: number; summary?: string }
  | { type: "task.waiting"; sourceId: string; at: number; summary?: string }
  | { type: "task.completed"; sourceId: string; at: number; summary?: string }
  | { type: "task.failed"; sourceId: string; at: number; summary?: string }
  | { type: "attention.requested"; sourceId: string; at: number; summary?: string };
```

```ts
// src/core/stimuli/stimulus-queue.ts
import type { Stimulus } from "./stimulus";

export type StimulusQueue = {
  push(stimulus: Stimulus): void;
  drain(): Stimulus[];
};

export function createStimulusQueue(): StimulusQueue {
  const items: Stimulus[] = [];

  return {
    push(stimulus) {
      items.push(stimulus);
    },
    drain() {
      return items.splice(0, items.length);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/core/stimulus-queue.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/stimuli tests/core/stimulus-queue.test.ts
git commit -m "feat: add neutral stimulus queue"
```

## Task 6: Wrap Matter.js And Emit Renderer-Independent Snapshots

**Files:**
- Create: `src/core/physics/matter-physics-world.ts`
- Create: `src/core/snapshots/world-snapshot.ts`
- Test: `tests/core/physics-world.test.ts`

- [ ] **Step 1: Write failing physics tests**

```ts
// tests/core/physics-world.test.ts
import { describe, expect, it } from "vitest";
import { createMatterPhysicsWorld } from "../../src/core/physics/matter-physics-world";

describe("matter physics world", () => {
  it("moves a body after an applied force and returns a snapshot", () => {
    const world = createMatterPhysicsWorld({ width: 800, height: 600 });
    world.addCircle("pet-a", { x: 100, y: 100 }, 16);

    world.applyForce("pet-a", { x: 0.02, y: 0 });
    world.step(16);

    const pet = world.snapshot().bodies.find((body) => body.id === "pet-a");
    expect(pet?.x).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/core/physics-world.test.ts`

Expected: FAIL because the physics module does not exist.

- [ ] **Step 3: Implement the snapshot contract**

```ts
// src/core/snapshots/world-snapshot.ts
export type BodySnapshot = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

export type WorldSnapshot = {
  width: number;
  height: number;
  bodies: BodySnapshot[];
};
```

- [ ] **Step 4: Implement the Matter.js wrapper**

```ts
// src/core/physics/matter-physics-world.ts
import { Bodies, Body, Engine, World } from "matter-js";
import type { WorldSnapshot } from "../snapshots/world-snapshot";

type Vector = { x: number; y: number };

export type MatterPhysicsWorld = {
  addCircle(id: string, position: Vector, radius: number): void;
  applyForce(id: string, force: Vector): void;
  step(deltaMs: number): void;
  snapshot(): WorldSnapshot;
};

export function createMatterPhysicsWorld(bounds: {
  width: number;
  height: number;
}): MatterPhysicsWorld {
  const engine = Engine.create({ gravity: { x: 0, y: 0 } });
  const bodies = new Map<string, Body>();

  return {
    addCircle(id, position, radius) {
      const body = Bodies.circle(position.x, position.y, radius, {
        frictionAir: 0.08,
        restitution: 0.2,
      });
      bodies.set(id, body);
      World.add(engine.world, body);
    },
    applyForce(id, force) {
      const body = bodies.get(id);
      if (body) {
        Body.applyForce(body, body.position, force);
      }
    },
    step(deltaMs) {
      Engine.update(engine, deltaMs);
    },
    snapshot() {
      return {
        width: bounds.width,
        height: bounds.height,
        bodies: [...bodies.entries()].map(([id, body]) => ({
          id,
          x: body.position.x,
          y: body.position.y,
          vx: body.velocity.x,
          vy: body.velocity.y,
          radius: body.circleRadius ?? 0,
        })),
      };
    },
  };
}
```

- [ ] **Step 5: Run the physics test**

Run: `npm test -- tests/core/physics-world.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/physics/matter-physics-world.ts src/core/snapshots/world-snapshot.ts tests/core/physics-world.test.ts
git commit -m "feat: add matter physics snapshots"
```

## Task 7: Implement The First Three Behavior Systems

**Files:**
- Create: `src/core/systems/idle-conversation-system.ts`
- Create: `src/core/systems/separation-steering-system.ts`
- Create: `src/core/systems/stimulus-reaction-system.ts`
- Test: `tests/core/systems.test.ts`

- [ ] **Step 1: Write failing system tests**

```ts
// tests/core/systems.test.ts
import { describe, expect, it } from "vitest";
import { createManualClock } from "../../src/shared/time/manual-clock";
import { runIdleConversationSystem } from "../../src/core/systems/idle-conversation-system";
import { runStimulusReactionSystem } from "../../src/core/systems/stimulus-reaction-system";

describe("behavior systems", () => {
  it("creates a speech bubble after a talkative pet idles long enough", () => {
    const clock = createManualClock(0);
    const pet = {
      id: "pet-a",
      components: {
        Talkative: { type: "Talkative" as const, idleAfterMs: 5_000 },
      },
      runtime: { lastActiveAt: 0, speech: null as string | null, intent: "idle" },
    };

    clock.advanceBy(5_000);
    runIdleConversationSystem([pet], clock);

    expect(pet.runtime.speech).toBe("Still here with you.");
  });

  it("turns waiting stimuli into an attention-seeking intent", () => {
    const pet = {
      id: "pet-a",
      sourceId: "agent-a",
      runtime: { intent: "idle", speech: null as string | null },
    };

    runStimulusReactionSystem([pet], [
      { type: "task.waiting", sourceId: "agent-a", at: 10, summary: "Needs approval" },
    ]);

    expect(pet.runtime.intent).toBe("seek-user");
    expect(pet.runtime.speech).toBe("Needs approval");
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- tests/core/systems.test.ts`

Expected: FAIL because the systems do not exist.

- [ ] **Step 3: Implement the idle conversation and stimulus systems**

```ts
// src/core/systems/idle-conversation-system.ts
import type { Clock } from "../../shared/time/manual-clock";

type TalkativePet = {
  components: {
    Talkative?: { type: "Talkative"; idleAfterMs: number };
  };
  runtime: {
    lastActiveAt: number;
    speech: string | null;
    intent: string;
  };
};

export function runIdleConversationSystem(pets: TalkativePet[], clock: Clock) {
  for (const pet of pets) {
    const talkative = pet.components.Talkative;
    if (!talkative || pet.runtime.speech) {
      continue;
    }

    if (clock.now() - pet.runtime.lastActiveAt >= talkative.idleAfterMs) {
      pet.runtime.speech = "Still here with you.";
    }
  }
}
```

```ts
// src/core/systems/stimulus-reaction-system.ts
import type { Stimulus } from "../stimuli/stimulus";

type ReactivePet = {
  id: string;
  sourceId: string;
  runtime: {
    intent: string;
    speech: string | null;
  };
};

export function runStimulusReactionSystem(pets: ReactivePet[], stimuli: Stimulus[]) {
  for (const stimulus of stimuli) {
    const pet = pets.find((candidate) => candidate.sourceId === stimulus.sourceId);
    if (!pet) {
      continue;
    }

    if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
      pet.runtime.intent = "seek-user";
      pet.runtime.speech = stimulus.summary ?? "I need you.";
    }
  }
}
```

- [ ] **Step 4: Implement separation steering**

```ts
// src/core/systems/separation-steering-system.ts
export type SteeringBody = {
  id: string;
  x: number;
  y: number;
};

export function computeSeparationForces(bodies: SteeringBody[], desiredDistance: number) {
  return bodies.map((body) => {
    let fx = 0;
    let fy = 0;

    for (const other of bodies) {
      if (body.id === other.id) {
        continue;
      }

      const dx = body.x - other.x;
      const dy = body.y - other.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance >= desiredDistance) {
        continue;
      }

      const strength = (desiredDistance - distance) / desiredDistance;
      fx += (dx / distance) * strength;
      fy += (dy / distance) * strength;
    }

    return { id: body.id, x: fx, y: fy };
  });
}
```

- [ ] **Step 5: Extend the test file with separation coverage**

```ts
// add this import near the other imports in tests/core/systems.test.ts
import { computeSeparationForces } from "../../src/core/systems/separation-steering-system";

it("pushes nearby pets away from each other", () => {
  const [first, second] = computeSeparationForces(
    [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 110, y: 100 },
    ],
    40,
  );

  expect(first.x).toBeLessThan(0);
  expect(second.x).toBeGreaterThan(0);
});
```

- [ ] **Step 6: Run the behavior tests**

Run: `npm test -- tests/core/systems.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/systems tests/core/systems.test.ts
git commit -m "feat: add initial pet behavior systems"
```

## Task 8: Assemble A Shared World And Deterministic Scenarios

**Files:**
- Create: `src/core/world/create-world.ts`
- Create: `src/core/world/scenario-fixtures.ts`
- Test: `tests/core/world-fixtures.test.ts`

- [ ] **Step 1: Write failing world tests**

```ts
// tests/core/world-fixtures.test.ts
import { describe, expect, it } from "vitest";
import { createDemoScenario } from "../../src/core/world/scenario-fixtures";

describe("demo scenario", () => {
  it("creates multiple pets in one shared world", () => {
    const scenario = createDemoScenario();
    const snapshot = scenario.world.snapshot();

    expect(snapshot.bodies).toHaveLength(3);
  });

  it("reacts to stimuli without needing pet assets", () => {
    const scenario = createDemoScenario();
    scenario.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Approve command",
    });
    scenario.world.step(16);

    expect(scenario.world.getPet("pet-a")?.runtime.intent).toBe("seek-user");
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- tests/core/world-fixtures.test.ts`

Expected: FAIL because the world factory does not exist.

- [ ] **Step 3: Implement the world factory**

```ts
// src/core/world/create-world.ts
import type { ManualClock } from "../../shared/time/manual-clock";
import { createMatterPhysicsWorld } from "../physics/matter-physics-world";
import { createStimulusQueue } from "../stimuli/stimulus-queue";
import { runIdleConversationSystem } from "../systems/idle-conversation-system";
import { runStimulusReactionSystem } from "../systems/stimulus-reaction-system";
import type { Stimulus } from "../stimuli/stimulus";

export type RuntimePet = {
  id: string;
  sourceId: string;
  components: {
    Talkative?: { type: "Talkative"; idleAfterMs: number };
  };
  runtime: {
    lastActiveAt: number;
    speech: string | null;
    intent: string;
  };
};

export function createWorld(input: {
  width: number;
  height: number;
  clock: ManualClock;
  pets: RuntimePet[];
}) {
  const physics = createMatterPhysicsWorld({ width: input.width, height: input.height });
  const stimuli = createStimulusQueue();

  for (const [index, pet] of input.pets.entries()) {
    physics.addCircle(pet.id, { x: 120 + index * 80, y: 200 }, 16);
  }

  return {
    getPet(id: string) {
      return input.pets.find((pet) => pet.id === id);
    },
    pushStimulus(stimulus: Stimulus) {
      stimuli.push(stimulus);
    },
    step(deltaMs: number) {
      runStimulusReactionSystem(input.pets, stimuli.drain());
      runIdleConversationSystem(input.pets, input.clock);
      physics.step(deltaMs);
    },
    snapshot() {
      return physics.snapshot();
    },
  };
}
```

- [ ] **Step 4: Implement the asset-free demo fixture**

```ts
// src/core/world/scenario-fixtures.ts
import { createManualClock } from "../../shared/time/manual-clock";
import { createWorld } from "./create-world";

export function createDemoScenario() {
  const clock = createManualClock(0);
  const world = createWorld({
    width: 960,
    height: 540,
    clock,
    pets: [
      {
        id: "pet-a",
        sourceId: "agent-a",
        components: { Talkative: { type: "Talkative", idleAfterMs: 5_000 } },
        runtime: { lastActiveAt: 0, speech: null, intent: "idle" },
      },
      {
        id: "pet-b",
        sourceId: "agent-b",
        components: {},
        runtime: { lastActiveAt: 0, speech: null, intent: "idle" },
      },
      {
        id: "pet-c",
        sourceId: "agent-c",
        components: {},
        runtime: { lastActiveAt: 0, speech: null, intent: "idle" },
      },
    ],
  });

  return { clock, world };
}
```

- [ ] **Step 5: Run the world tests**

Run: `npm test -- tests/core/world-fixtures.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/world tests/core/world-fixtures.test.ts
git commit -m "feat: assemble shared simulation world"
```

## Task 9: Render Debug Primitives On Browser Canvas

**Files:**
- Create: `src/playground/browser/canvas-renderer.ts`
- Create: `src/playground/browser/debug-overlay.ts`
- Test: `tests/playground/canvas-renderer.test.ts`

- [ ] **Step 1: Write failing canvas renderer tests**

```ts
// tests/playground/canvas-renderer.test.ts
import { describe, expect, it, vi } from "vitest";
import { drawWorld } from "../../src/playground/browser/canvas-renderer";

describe("canvas renderer", () => {
  it("draws fallback bodies when no asset catalog is supplied", () => {
    const context = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawWorld(
      context,
      {
        width: 320,
        height: 180,
        bodies: [{ id: "pet-a", x: 100, y: 80, vx: 1, vy: 0, radius: 16 }],
      },
      {},
    );

    expect(context.arc).toHaveBeenCalledWith(100, 80, 16, 0, Math.PI * 2);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/playground/canvas-renderer.test.ts`

Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement debug overlay helpers**

```ts
// src/playground/browser/debug-overlay.ts
import type { BodySnapshot } from "../../core/snapshots/world-snapshot";

export function drawDebugBody(context: CanvasRenderingContext2D, body: BodySnapshot) {
  context.beginPath();
  context.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillText(body.id, body.x - body.radius, body.y - body.radius - 8);
}
```

- [ ] **Step 4: Implement the fallback canvas renderer**

```ts
// src/playground/browser/canvas-renderer.ts
import type { WorldSnapshot } from "../../core/snapshots/world-snapshot";
import { drawDebugBody } from "./debug-overlay";

export type AssetCatalog = Record<string, HTMLImageElement>;

export function drawWorld(
  context: CanvasRenderingContext2D,
  snapshot: WorldSnapshot,
  assets: AssetCatalog,
) {
  context.clearRect(0, 0, snapshot.width, snapshot.height);

  for (const body of snapshot.bodies) {
    drawDebugBody(context, body);
  }
}
```

- [ ] **Step 5: Run the renderer tests**

Run: `npm test -- tests/playground/canvas-renderer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/playground/browser/canvas-renderer.ts src/playground/browser/debug-overlay.ts tests/playground/canvas-renderer.test.ts
git commit -m "feat: add canvas debug renderer"
```

## Task 10: Support Real Pet Sprites In The Browser Renderer

**Files:**
- Create: `src/pets/assets/atlas-loader.ts`
- Modify: `src/playground/browser/canvas-renderer.ts`
- Test: `tests/playground/canvas-renderer.test.ts`

- [ ] **Step 1: Extend the renderer test with sprite coverage**

```ts
// append to tests/playground/canvas-renderer.test.ts
it("draws a sprite when an asset exists for a body", () => {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const image = {} as HTMLImageElement;

  drawWorld(
    context,
    {
      width: 320,
      height: 180,
      bodies: [{ id: "pet-a", x: 100, y: 80, vx: 1, vy: 0, radius: 16 }],
    },
    { "pet-a": image },
  );

  expect(context.drawImage).toHaveBeenCalledWith(image, 52, 28, 96, 104);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/playground/canvas-renderer.test.ts`

Expected: FAIL because `drawWorld` does not render sprites yet.

- [ ] **Step 3: Add the atlas loader utility**

```ts
// src/pets/assets/atlas-loader.ts
export async function loadAtlasImage(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load atlas: ${src}`));
    image.src = src;
  });
}
```

- [ ] **Step 4: Keep the existing renderer sprite branch and make the test pass**

```ts
// src/playground/browser/canvas-renderer.ts
import type { WorldSnapshot } from "../../core/snapshots/world-snapshot";
import { drawDebugBody } from "./debug-overlay";

export type AssetCatalog = Record<string, HTMLImageElement>;

export function drawWorld(
  context: CanvasRenderingContext2D,
  snapshot: WorldSnapshot,
  assets: AssetCatalog,
) {
  context.clearRect(0, 0, snapshot.width, snapshot.height);

  for (const body of snapshot.bodies) {
    const sprite = assets[body.id];
    if (sprite) {
      context.drawImage(sprite, body.x - 48, body.y - 52, 96, 104);
      continue;
    }

    drawDebugBody(context, body);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- tests/playground/canvas-renderer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pets/assets/atlas-loader.ts src/playground/browser/canvas-renderer.ts tests/playground/canvas-renderer.test.ts
git commit -m "feat: render optional pet sprites on canvas"
```

## Task 11: Wire The Playground To A Live Demo Scenario

**Files:**
- Modify: `src/playground/browser/playground-app.tsx`
- Create: `src/playground/browser/scenario-controls.tsx`
- Test: `tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Extend the smoke test with controls**

```tsx
// replace tests/smoke/playground-app.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaygroundApp } from "../../src/playground/browser/playground-app";

describe("PlaygroundApp", () => {
  it("renders the simulation canvas shell", () => {
    render(<PlaygroundApp />);

    expect(screen.getByRole("heading", { name: "pets-driven playground" })).toBeInTheDocument();
    expect(screen.getByTestId("world-canvas")).toBeInTheDocument();
  });

  it("accepts a waiting stimulus from the controls", () => {
    render(<PlaygroundApp />);

    fireEvent.click(screen.getByRole("button", { name: "Send waiting stimulus" }));

    expect(screen.getByText("Last stimulus: task.waiting")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/smoke/playground-app.test.tsx`

Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Implement the scenario controls**

```tsx
// src/playground/browser/scenario-controls.tsx
type ScenarioControlsProps = {
  lastStimulus: string;
  onSendWaiting(): void;
};

export function ScenarioControls({ lastStimulus, onSendWaiting }: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
      <button type="button" onClick={onSendWaiting}>
        Send waiting stimulus
      </button>
      <p>Last stimulus: {lastStimulus}</p>
    </section>
  );
}
```

- [ ] **Step 4: Wire the playground app to the demo world**

```tsx
// src/playground/browser/playground-app.tsx
import { useEffect, useRef, useState } from "react";
import { createDemoScenario } from "../../core/world/scenario-fixtures";
import { drawWorld } from "./canvas-renderer";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const intervalId = window.setInterval(() => {
      scenarioRef.current.clock.advanceBy(16);
      scenarioRef.current.world.step(16);
      drawWorld(context, scenarioRef.current.world.snapshot(), {});
    }, 16);

    return () => window.clearInterval(intervalId);
  }, []);

  function sendWaitingStimulus() {
    scenarioRef.current.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-a",
      at: scenarioRef.current.clock.now(),
      summary: "Approve command",
    });
    setLastStimulus("task.waiting");
  }

  return (
    <main className="playground-shell">
      <header>
        <h1>pets-driven playground</h1>
      </header>
      <ScenarioControls lastStimulus={lastStimulus} onSendWaiting={sendWaitingStimulus} />
      <canvas ref={canvasRef} data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
```

- [ ] **Step 5: Run the smoke tests**

Run: `npm test -- tests/smoke/playground-app.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/playground/browser/playground-app.tsx src/playground/browser/scenario-controls.tsx tests/smoke/playground-app.test.tsx
git commit -m "feat: wire live browser playground"
```

## Task 12: Add Browser-Level Verification With Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/playground.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing Playwright spec**

```ts
// e2e/playground.spec.ts
import { expect, test } from "@playwright/test";

test("playground renders and accepts a stimulus", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "pets-driven playground" })).toBeVisible();
  await expect(page.getByTestId("world-canvas")).toBeVisible();

  await page.getByRole("button", { name: "Send waiting stimulus" }).click();
  await expect(page.getByText("Last stimulus: task.waiting")).toBeVisible();
});
```

- [ ] **Step 2: Add the Playwright config**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Run the e2e test and verify it fails before Playwright browsers are installed**

Run: `npm run test:e2e`

Expected: FAIL with Playwright asking for browser installation.

- [ ] **Step 4: Install the Chromium browser used by Playwright**

Run: `npm exec playwright -- install chromium`

Expected: Chromium installs successfully.

- [ ] **Step 5: Run the full verification suite**

Run: `npm test`

Expected: PASS.

Run: `npm run test:e2e`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json playwright.config.ts e2e/playground.spec.ts
git commit -m "test: add browser playground verification"
```

## Final Verification Checklist

- [ ] Run `npm test`
- [ ] Run `npm run test:e2e`
- [ ] Run `npm run build`
- [ ] Start `npm run dev`
- [ ] Open the playground in a browser
- [ ] Confirm fallback debug rendering works with no pet assets
- [ ] Confirm optional sprite rendering can draw a supplied pet atlas image on canvas
- [ ] Confirm a waiting stimulus changes the visible playground state

## Self-Review Notes

### Spec Coverage

- Headless core: Tasks 2-8
- ECS composition: Tasks 3-4
- User-owned profiles and service-owned presets: Task 4
- Neutral stimuli: Task 5
- Matter.js-backed physics: Task 6
- Shared world: Task 8
- Debug rendering without assets: Task 9
- Sprite rendering with assets: Task 10
- Browser playground: Tasks 1, 11, 12
- Deterministic tests: Tasks 2, 7, 8

### Placeholder Scan

No `TBD`, `TODO`, "implement later", or unstated code steps remain.

### Type Consistency

- `Stimulus`, `WorldSnapshot`, `RuntimePet`, and `AssetCatalog` are defined before later tasks use them.
- The canvas renderer consistently consumes `WorldSnapshot`.
- User pet profiles remain separate from external pet assets and presets throughout the plan.
