# web

The public marketing site: a Next.js 14 App Router landing page plus the Remotion pipeline that renders the product demo video. Consumes `@pets-driven/design-system`, `@pets-driven/i18n`, and `@pets-driven/pet-engine`. See the repo-root `CONTEXT.md` for the domain language.

## Commands

```bash
pnpm --filter @pets-driven/web dev          # next dev (runs sync-pet-assets first)
pnpm --filter @pets-driven/web typecheck    # tsc --noEmit
pnpm video:studio                           # Remotion studio
pnpm video:still                            # re-render the poster PNG
pnpm video:render                           # render service-demo.mp4
```

## Layout

- `app/[locale]/` — the only route segment; `layout.tsx` wires `I18nProvider` + metadata, `page.tsx` is the landing page
- `app/globals.css` — imports the design-system `styles.css` entry, then adds only scene animations
- `components/` — `Intro.tsx` (largest file, ~871 lines), `IntroScenes.tsx`, `LanguageSwitcher.tsx`
- `middleware.ts` — locale redirect for bare paths
- `remotion/` — the `index.tsx` entry plus `service-demo/` (`ServiceDemoVideo.tsx`, `components.tsx`, `timeline.ts`, `fixtures.ts`)
- `public/` — static assets; `public/codex-pets/` is generated and git-ignored

## Cross-module dependencies

- Consumes `@pets-driven/design-system` (styles and components), `@pets-driven/i18n` (`common` + `landing` namespaces), and `@pets-driven/pet-engine` (pet rendering in the landing scenes and the demo video).
- Pet assets arrive from the repo-root `pets/` directory through `sync-pet-assets`, run automatically by `predev` and `prebuild`.
- Nothing depends on this app. Anything the desktop app also needs belongs in a package, not here.

## Non-obvious rules

- **There is no non-localized route.** Every page lives under `app/[locale]/`, and `middleware.ts` redirects bare paths to a locale resolved from the `pd-locale` cookie, then `Accept-Language`, then `defaultLocale`. Its matcher deliberately skips `_next` and anything with a file extension.
- **Pet assets are synced, not committed.** `predev` and `prebuild` run `node ../../scripts/sync-pet-assets.mjs web`, which copies from the repo-root `pets/` directory into `public/codex-pets/`. Edit the canonical files under `pets/`; never hand-edit the generated output.
- **Do not add styling that duplicates the design system.** `globals.css` imports the shared stylesheet and should only gain page-specific scene animation; component styling belongs in `packages/design-system`.
- **Remotion is a separate entry from Next.** The video compositions are registered in the `remotion/` entry file and are not part of `next build`; timing changes go in `remotion/service-demo/timeline.ts`, and `video:still` pins `--frame=336` for the poster.
- **This package has no test script.** Verification is `typecheck` plus a visual check via `dev` or `video:studio` — do not assume `pnpm --filter @pets-driven/web test` exists.
