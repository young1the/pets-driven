# AGENTS.md

Pets-Driven is a Windows desktop app (Tauri + React) where a pet represents one bound coding-agent execution, plus the landing site and shared packages around it. Start with `CONTEXT.md` for the domain language and `ARCHITECTURE.md` for how the modules connect.

## Language

- All code comments, JSDoc, and in-repo documentation (Markdown, ADRs, READMEs) must be written in English.
- Git commit messages and pull request descriptions must also be written in English.
- This applies to source files, type definitions, test descriptions, and any docs committed to the repository.
- Conversations and chat with the user may continue in Korean; only artifacts written to disk or git history are English-only.

## Commands

```bash
pnpm dev              # desktop app (Tauri)
pnpm dev:playground   # simulation playground in the browser
pnpm dev:design       # design-system component gallery
pnpm test             # every package's suite + scripts/*.test.mjs
pnpm typecheck        # tsc across the workspace
pnpm check            # biome lint + format check
pnpm sync-pets        # copy repo-root pets/ into each app's public assets
pnpm test:e2e         # Playwright, desktop only
```

## Modules

| Path | What it owns | Docs |
| --- | --- | --- |
| `apps/desktop` | Tauri shell, pet windows, agent event ingress | `apps/desktop/AGENTS.md` |
| `apps/web` | Landing site + Remotion demo video | `apps/web/AGENTS.md` |
| `packages/pet-engine` | ECS simulation, personalities, sprite state | `packages/pet-engine/AGENTS.md` |
| `packages/design-system` | Tokens and shared React components | `packages/design-system/AGENTS.md` |
| `packages/i18n` | Locales, i18next setup, translation catalog | `packages/i18n/AGENTS.md` |
| `plugins/pets-driven` | Claude Code plugin: hooks, commands, skills | — |
| `pets/` | Canonical built-in pet definitions and spritesheets | `pets/README.md` |
| `scripts/` | Asset sync, version bump, install test | — |

```mermaid
graph TD
  desktop[apps/desktop] --> engine[packages/pet-engine]
  desktop --> ds[packages/design-system]
  desktop --> i18n[packages/i18n]
  web[apps/web] --> engine
  web --> ds
  web --> i18n
  ds -.->|dev only| engine
```

`pet-engine` depends on nothing in the workspace and must stay that way. Full graph, runtime event flow, and a ripple table: `ARCHITECTURE.md`.

## Non-obvious rules

- **Gotcha: `pets/` at the repo root is the source of truth for built-in pets.** `pnpm sync-pets` copies it into each app's git-ignored public assets directory. Editing the copied output looks like it works until the next sync silently reverts it.
- **Note: the pet window is a fixed 192x268 always-on-top overlay.** The OS window never shrinks, so the projection must center that fixed window rather than the scaled sprite frame — otherwise small pets sink and the collision capsule clips.
- **Why the engine is a separate package:** the simulation must stay deterministic and headless so it can be tested without a window. Keep `Math.random()`, `Date.now()`, and DOM access out of it.
- **Don't add a system without registering it** in the pet-engine phase pipeline (`packages/pet-engine/src/core/phases.ts`); an unregistered system silently never runs.
- **Caveat: `pnpm test` is the full workspace suite and is slow.** For a change scoped to one package, run that package's own suite with `pnpm --filter <pkg> test`. A pure token hex edit needs neither the desktop suite nor a typecheck.

## Conventions

- Each module keeps its context in its own `AGENTS.md`, with a one-line `CLAUDE.md` beside it that reads `See [AGENTS.md](./AGENTS.md).` — content lives in exactly one file.
- Every cross-package import goes through the target package's declared `exports` entry (`@pets-driven/<pkg>/...`), never a deep relative path across a package boundary.
