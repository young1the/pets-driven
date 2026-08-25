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

- `app/[locale]/` — the only route segment; `layout.tsx` wires `I18nProvider`, metadata, the fixed site nav, and the `SoftwareApplication` JSON-LD, `page.tsx` is the landing page
- `app/globals.css` — imports the design-system `styles.css` entry, then adds the landing page's own scene animations and the handful of rules its inline styles cannot express (media queries)
- `app/robots.ts`, `app/sitemap.ts` — `/robots.txt` and `/sitemap.xml`
- `lib/site.ts` — the canonical origin plus every URL and hreflang set derived from it; shared by the metadata, the sitemap, and the CTA links
- `components/` — `Intro.tsx` (largest file), `IntroScenes.tsx`, `DemoVideo.tsx`, `DownloadButton.tsx`, `LanguageSwitcher.tsx`, `GithubLink.tsx`
- `proxy.ts` — locale redirect for bare paths (the Next 16 name for what was `middleware.ts`)
- `remotion/` — the `index.tsx` entry plus `service-demo/` (`ServiceDemoVideo.tsx`, `components.tsx`, `timeline.ts`, `fixtures.ts`)
- `public/` — static assets; `public/codex-pets/` is generated and git-ignored

## Cross-module dependencies

- Consumes `@pets-driven/design-system` (styles and components), `@pets-driven/i18n` (`common` + `landing` namespaces), and `@pets-driven/pet-engine` (pet rendering in the landing scenes and the demo video).
- Pet assets arrive from the repo-root `pets/` directory through `sync-pet-assets`, run automatically by `predev` and `prebuild`.
- Nothing depends on this app. Anything the desktop app also needs belongs in a package, not here.

## Non-obvious rules

- **Every absolute URL comes from `SITE_URL` in `lib/site.ts`.** Canonical links, hreflang, Open Graph, the sitemap, and robots.txt all derive from that one value (`NEXT_PUBLIC_SITE_URL`, defaulting to the production domain), so a domain move is a single env change instead of a hunt for hardcoded hosts.
- **Gotcha: the sitemap needs *absolute* hreflang hrefs, unlike page metadata.** `Metadata.alternates` is resolved against `metadataBase`, but the sitemap serializer is not — relative hrefs there emit as-is and Google ignores them. Hence the two exports, `hreflangAlternates` (relative, for metadata) and `absoluteHreflangAlternates` (for `sitemap.ts`).
- **The about section deliberately skips `data-reveal`.** Every other section starts at `opacity: 0` until an `IntersectionObserver` fires; that section is the page's only sustained prose and has to be visible in the HTML as served.
- **There is no non-localized route.** Every page lives under `app/[locale]/`, and `proxy.ts` redirects bare paths to a locale resolved from the `pd-locale` cookie, then `Accept-Language`, then `defaultLocale`. Its matcher deliberately skips `_next` and anything with a file extension.
- **Never give a demo clip `autoPlay`; use `DemoVideo`.** `autoplay` overrides `preload`, so the browser starts fetching a clip that is four screens down while the hero is still painting — which is how the product demo used to pull 4.2 MB on every page load. `DemoVideo` ships `preload="none"` and starts the fetch from an `IntersectionObserver`, the deferral `loading="lazy"` gives an `<img>`.
- **The demo clips exist in three formats and only the GIF is authored.** `docs/assets/*.gif` is the source of truth the READMEs embed; `pnpm encode-demos` derives the `.mp4` the site plays (about a sixth of the bytes) and the first-frame `.webp` poster beside it, and all three are committed there because ffmpeg is not guaranteed in CI. `sync-demo-assets` copies every format into the git-ignored `public/demo/`.
- **The `<video>` poster is the WebP, the Open Graph image is the PNG.** Same frame, both emitted by `video:still`: the 1920x1080 PNG stays for crawlers that prefer it, and the 1281x720 WebP — 16 KB against 620 KB — is what the page actually loads.
- **Pet assets are synced, not committed.** `predev` and `prebuild` run `node ../../scripts/sync-pet-assets.mjs web`, which copies from the repo-root `pets/` directory into `public/codex-pets/`. Edit the canonical files under `pets/`; never hand-edit the generated output.
- **Do not add styling that duplicates the design system.** `globals.css` imports the shared stylesheet and should only gain what is specific to this page — its scene animations, and rules the section's inline styles cannot carry, such as a media query. Component styling belongs in `packages/design-system`.
- **Remotion is a separate entry from Next.** The video compositions are registered in the `remotion/` entry file and are not part of `next build`; timing changes go in `remotion/service-demo/timeline.ts`, and `video:still` pins `--frame=336` for the poster.
- **This package has no test script.** Verification is `typecheck` plus a visual check via `dev` or `video:studio` — do not assume `pnpm --filter @pets-driven/web test` exists.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
