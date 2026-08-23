# pet-engine

Deterministic ECS simulation for pets: world state, per-tick systems, personalities, and the sprite/status React components the apps render. Consumed by `apps/desktop` and `apps/web`. See the repo-root `CONTEXT.md` for the domain language (Pet, Attention Hold, Agent Event Feed).

## Commands

```bash
pnpm --filter @pets-driven/pet-engine test        # vitest run
pnpm --filter @pets-driven/pet-engine typecheck   # tsc -p tsconfig.json
```

## Layout

- `src/core/` — world, entities, component store, tick pipeline (`phases.ts`, `simulation-system.ts`, `create-world.ts`)
- `src/features/<name>/` — one slice per concern (`behavior`, `movement`, `physics`, `social`, `drives`, `mood`, `perception`, `cursor`, `contact`, `interaction`, `items`), each as `components.ts` (data) + `systems.ts` (logic); `agent` and `events` are data-only slices
- `behavior` is the exception: too large for one `systems.ts`, so its logic is one file per system or system group (`decision-system.ts`, `planning-system.ts`, `collision-systems.ts`, …) over a shared base of `claim.ts`, `geometry.ts`, and `activity-tuning.ts`. `behavior-systems.ts` holds the descriptors `phases.ts` imports, and is the file to look at first
- `src/pets/` — `personalities/`, `profiles/`, `constants/`, plus the React `rendering/` and `status/` components
- `src/shared/` — `src/shared/random/seeded-random.ts`, `src/shared/time/manual-clock.ts`
- `tests/` — mirrors `src/` one-to-one

## Cross-module dependencies

- Depends on **nothing** in the workspace — it is the leaf package. Keep it that way: no imports from `apps/`, and no DOM or Tauri APIs in simulation code.
- Consumed by `apps/desktop` (live pets), `apps/web` (landing/demo), and `packages/design-system` as a dev-only dependency for its gallery.
- A change to world state, phases, or component shape ripples into both apps; see the repo-root `ARCHITECTURE.md`.

## Non-obvious rules

- **Imports go through the package's own subpath exports**, even inside the package: `@pets-driven/pet-engine/features/behavior/claim`, not a relative path. `package.json` maps `./*` → `./src/*.ts`. A new `.tsx` file needs its own explicit `exports` entry — the wildcard only covers `.ts`.
- **A system does not run until it is registered in `src/core/phases.ts`.** `SYSTEM_PHASES` is the single source of truth, and phase order is a contract: PRE_UPDATE (sync external state) → BEHAVIOR (priority-ordered claim/skip decisions) → UPDATE (locomotion state) → POST_UPDATE (force accumulation) → SIMULATE (physics integration). Placement within a phase matters; keep the inline `//` comments explaining why.
- **Force constants in `src/pets/constants/pet-body.ts` are tuned for the default 32x38 body.** Matter.js mass scales with area, so a bigger body under the same walk force or jump impulse simply stops moving or jumping — scale forces with area instead of reusing the defaults.
- **Sprite rendering is row-only.** There is no mirroring or facing flip: a new direction means a new spritesheet row. The intent → row mapping lives in `src/features/behavior/pet-animation-state.ts`. The one direction-related knob, `resolveRunningDirection` in `src/pets/assets/pet-atlas.ts`, stays inside that rule — it trades the two running rows for one another for a pet whose sheet draws them reversed (common in spritesheets found online), and never mirrors pixels. It is a host-side presentation choice applied to the row the engine already picked, so no system reads it.
- **Quiet Mode is a world-level dial, not a component.** It rides `WorldStepContext` (`core/quiet-mode.ts`) and the host turns it with `world.setQuietMode` on the live world, so a pet deployed mid-mode is covered without being stamped and a rebuild is never needed to change it. What it takes away is taken away in two places on purpose: the systems that would *decide* to speak or go somewhere bail early (so nothing labels a pet as chatting with nothing to say), and `QuietChatterSystem` sweeps the channel at the end of BEHAVIOR so a new source of chatter is silenced the day it is written, before any of it reaches a snapshot. Agent status is never swept — `isChatterChannelSource` is the one place that decides which is which.
- **Keep the simulation deterministic.** Use `createSeededRandom` and `createManualClock` from `src/shared/`; never `Math.random()` or `Date.now()` inside a system.
- **A tool event is a pulse, not a task start.** `tool.used` refreshes activity context without re-speaking, re-claiming, resetting `since`, or reopening completed/failed work. Bursts may update `AgentActivitySignal`, but they never replace a live behavior decision.
- **Working uses the ordinary behavior pipeline.** `BehaviorDecisionSystem` ranks work-focus, work-review, and work-pace from `working-styles.ts`, emits a normal token, and `BehaviorPlanningSystem` materializes it. There is no working-only system. Stationary work behaviors each hold one native atlas row; only work-pace creates real locomotion.
- **Behaviors are sustained activities that hold a duration**, not sub-second per-tick re-rolls. When a pet arrives and dwells, do not clobber the cooldown history that decided the activity.
- **A capability component alone does not change how a pet moves — the locomotion tag does.** `CanFly` without `FlyingTag` is inert, and leaving `WalkingTag` on a flier has WalkSystem and JumpSystem fighting the flight systems for the same body. The `items` slice is the one place that swaps a pet's capabilities at runtime (`grantItemAbility` / `revokeItemAbility` in `features/items/systems.ts`); go through it rather than setting a capability by hand.
- **Revoking a capability has to undo what it did to the physics body too.** `FlightSystem` re-zeroes a flier's gravity every tick *from* `CanFly`, so dropping `CanFly` alone leaves the pet hanging in the air forever — the revoke path resets the gravity scale itself. The same applies to a climb in progress: every climb system bails on a missing `CanWallClimb`, so a leftover `ClimbingTag` strands the pet on the wall.
- **Every `expiresAt` in a snapshot is on the simulation clock, so `snapshot().now` is what makes it readable.** The world is stepped a fixed slice per tick and starts from zero, so its clock is neither wall time nor recoverable by a host holding the snapshot — without the reading beside them, an item's fade deadline or a `CarriedItem.expiresAt` cannot be turned into the duration a countdown needs. Anything absolute added to a snapshot inherits this: measure it against `now` from the same snapshot, never `Date.now()`.
- **Why adopted pets get climbable columns they usually cannot use:** `createDesktopClimbableSurfaces` puts one just inside each monitor edge. Without a `ClimbableSurface` in the world, the claws trinket would grant a capability with nothing to use it on. They are inert for a pet without `CanWallClimb`.
- **Gotcha: a climbable is judged on x alone, at every layer.** Its Transform marks the *middle of the height it spans*, not a point a pet walks to, so any straight-line distance to it is dominated by a vertical gap the pet cannot close by walking — on a 1080p desktop the columns sit ~460px above the floor, and a euclidean perception check at the 400px pet range meant a grounded pet perceived no climbable anywhere on the screen, silently costing the claws trinket its entire purpose. `ContactSystem` (`CLIMBABLE_CONTACT_X_RADIUS`) and `PerceptionSystem` (`CLIMBABLE_PERCEPTION_RANGE`) both measure horizontally; anything new that reasons about reaching a wall must too. Every unit test in the chain passed while the feature was dead end to end, so changes here belong in `tests/features/items/claws-climb-the-desktop.test.ts`, which drives the live desktop scenario.
