# design-system

Shared visual layer for both apps: CSS custom-property tokens plus source-only React components. See the repo-root `CONTEXT.md` for the domain language.

## Commands

```bash
pnpm dev:design                                       # component gallery (Vite, serves dev/)
pnpm --filter @pets-driven/design-system test         # vitest run
pnpm --filter @pets-driven/design-system typecheck    # tsc -p tsconfig.json
```

## Layout

- `src/tokens/` — one CSS file per token family (`colors.css`, `typography.css`, `spacing.css`, `radius.css`, `shadows.css`, `motion.css`, `fonts.css`, `base.css`)
- `src/styles.css` — the single global entry consumers link; `@import` lines only
- `src/components/<group>/` — `button.tsx` + `button.css` pairs, grouped as `buttons`, `forms`, `data-display`, `feedback`, `navigation`, `pets`, `pet-showcase`, `icons`
- `src/index.ts` — the public component/type barrel
- `src/assets/` — brand mark and pet portraits
- `dev/` — gallery app, dev-only (`vite.config.ts` sets `root: "dev"`)
- `tests/colors-mirror.test.ts`

## Cross-module dependencies

- Consumed by `apps/desktop` and `apps/web`; both import the shared stylesheet entry and the component barrel.
- Depends on `@pets-driven/pet-engine` as a **dev dependency only**, for the gallery under `dev/`. Shipping component code must not import the engine.
- A token change is workspace-wide by definition — see the ripple table in the repo-root `ARCHITECTURE.md`.

## Non-obvious rules

- **`src/tokens/colors.css` is the source of truth; `src/tokens/colors.ts` is a hand-maintained mirror** for non-CSS consumers such as canvas renderers. `tests/colors-mirror.test.ts` fails the build when a value drifts, so a color change means editing both files in the same commit. A pure hex-value edit needs neither the desktop suite nor a typecheck — run this package's test only.
- **The package ships as source and has no build step.** `package.json` `exports` maps `.` → `src/index.ts`, `./tokens` → `src/tokens/colors.ts`, plus the `styles.css` and `assets` subpaths. A new public component needs both a barrel export in `src/index.ts` and, if it is not reachable through an existing entry, an `exports` entry.
- **Each component imports its own sibling CSS file** (`button.tsx` imports `button.css` at the top) rather than relying on the global sheet. `sideEffects` in `package.json` lists `**/*.css` so bundlers keep those imports — a new component follows the same `.tsx` + sibling `.css` pair.
- **Add a new token as a CSS custom property in the matching `src/tokens/*.css` file**, and add the `@import` to `src/styles.css` only when creating a whole new token file. Components read `var(--token)`; they do not hardcode values.
- **Adding a new pet portrait to `src/assets/pets/`** does not make it a built-in pet. Built-in pet definitions live in the repo-root `pets/` directory, which is the canonical source.
