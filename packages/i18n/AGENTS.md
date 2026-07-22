# i18n

Locale configuration, i18next setup, and the translation catalog shared by the desktop app and the landing site. See the repo-root `CONTEXT.md` for the domain language.

## Commands

```bash
pnpm --filter @pets-driven/i18n typecheck   # tsc -p tsconfig.json
```

## Layout

- `src/config.ts` — `locales` (`en`, `ko`), `defaultLocale`, `namespaces` (`common`, `landing`, `desktop`), `localeLabels`, `isLocale`
- `src/locales/<locale>/<namespace>.json` — the catalog itself
- `src/resources.ts` — full catalog (all three namespaces)
- `src/resources.landing.ts` — `common` + `landing` only
- `src/create-instance.ts`, plus `provider.tsx` beside it — i18next instance and React provider
- `src/server.ts` — `getServerTranslation` for RSC/metadata
- `src/testing.ts` — test helpers
- `src/index.ts` — public entry

## Cross-module dependencies

- Consumed by `apps/desktop` (`desktop` namespace) and `apps/web` (`common` + `landing`); `apps/web/middleware.ts` and its route params read `locales` from this package's config.
- Depends on nothing in the workspace.
- Adding a namespace or locale touches every consumer's bundle — see the repo-root `ARCHITECTURE.md`.

## Non-obvious rules

- **English is the source of truth for key typing.** `resources.ts` derives `LandingResource` / `DesktopResource` from the English bundles, so a key must be added to `src/locales/en/*.json` first — Korean-only keys are invisible to types.
- **Two catalogs exist on purpose.** `resources.landing.ts` never imports `desktop.json` so the marketing site's client bundle does not ship the large desktop translations. Adding a desktop key to the landing catalog silently undoes that split.
- **Entry points are explicit `exports`:** `.`, `./config`, `./server`, `./testing`. Consumers import `@pets-driven/i18n/config`, not a deep `src/` path — a new public module needs a new `exports` entry.
- **Bundles are imported statically, not lazily**, because the catalog is small and eager bundling keeps setup synchronous (no async flash during SSR/hydration). Keep new namespaces small or revisit that trade-off deliberately.
- **Adding a locale is a config change plus a full translation set:** extend `locales` and `localeLabels` in `src/config.ts`, add `src/locales/<new>/` for every namespace, and register it in both `resources.ts` and `resources.landing.ts`. `apps/web/middleware.ts` and `generateStaticParams` pick it up from `locales` automatically.
- **This package has no test script**; verification is `typecheck` plus the consuming app's suite.
