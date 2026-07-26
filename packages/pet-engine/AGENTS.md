# pet-engine

Deterministic ECS simulation for pets: world state, per-tick systems, personalities, and the sprite/status React components the apps render. Consumed by `apps/desktop` and `apps/web`. See the repo-root `CONTEXT.md` for the domain language (Pet, Attention Hold, Agent Event Feed).

## Commands

```bash
pnpm --filter @pets-driven/pet-engine test        # vitest run
pnpm --filter @pets-driven/pet-engine typecheck   # tsc -p tsconfig.json
```

## Layout

- `src/core/` — world, entities, component store, tick pipeline (`phases.ts`, `simulation-system.ts`, `create-world.ts`)
- `src/features/<name>/` — one slice per concern (`behavior`, `movement`, `physics`, `social`, `drives`, `mood`, `perception`, `cursor`, `contact`, `interaction`), each as `components.ts` (data) + `systems.ts` (logic); `agent` and `events` are data-only slices
- `src/pets/` — `personalities/`, `profiles/`, `constants/`, plus the React `rendering/` and `status/` components
- `src/shared/` — `src/shared/random/seeded-random.ts`, `src/shared/time/manual-clock.ts`
- `tests/` — mirrors `src/` one-to-one

## Cross-module dependencies

- Depends on **nothing** in the workspace — it is the leaf package. Keep it that way: no imports from `apps/`, and no DOM or Tauri APIs in simulation code.
- Consumed by `apps/desktop` (live pets), `apps/web` (landing/demo), and `packages/design-system` as a dev-only dependency for its gallery.
- A change to world state, phases, or component shape ripples into both apps; see the repo-root `ARCHITECTURE.md`.

## Non-obvious rules

- **Imports go through the package's own subpath exports**, even inside the package: `@pets-driven/pet-engine/features/behavior/systems`, not a relative path. `package.json` maps `./*` → `./src/*.ts`. A new `.tsx` file needs its own explicit `exports` entry — the wildcard only covers `.ts`.
- **A system does not run until it is registered in `src/core/phases.ts`.** `SYSTEM_PHASES` is the single source of truth, and phase order is a contract: PRE_UPDATE (sync external state) → BEHAVIOR (priority-ordered claim/skip decisions) → UPDATE (locomotion state) → POST_UPDATE (force accumulation) → SIMULATE (physics integration). Placement within a phase matters; keep the inline `//` comments explaining why.
- **Force constants in `src/pets/constants/pet-body.ts` are tuned for the default 32x38 body.** Matter.js mass scales with area, so a bigger body under the same walk force or jump impulse simply stops moving or jumping — scale forces with area instead of reusing the defaults.
- **Sprite rendering is row-only.** There is no mirroring or facing flip: a new direction means a new spritesheet row. The intent → row mapping lives in `src/features/behavior/pet-animation-state.ts`.
- **Keep the simulation deterministic.** Use `createSeededRandom` and `createManualClock` from `src/shared/`; never `Math.random()` or `Date.now()` inside a system.
- **A tool event is a pulse, not a task start.** `tool.used` refreshes activity context without re-speaking, re-claiming, resetting `since`, or reopening completed/failed work. Bursts may update `AgentActivitySignal`, but they never replace a live behavior decision.
- **Working uses the ordinary behavior pipeline.** `BehaviorDecisionSystem` ranks work-focus, work-review, and work-pace from `working-styles.ts`, emits a normal token, and `BehaviorPlanningSystem` materializes it. There is no working-only system. Stationary work behaviors each hold one native atlas row; only work-pace creates real locomotion.
- **Behaviors are sustained activities that hold a duration**, not sub-second per-tick re-rolls. When a pet arrives and dwells, do not clobber the cooldown history that decided the activity.
