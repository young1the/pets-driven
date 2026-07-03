# @pets-driven/web

The official Pets-Driven homepage — a Next.js (App Router) app that implements
the "Pets-Driven Intro" design: a scroll-driven story where demon eyes in the
dark resolve into the pack as light rises, followed by the personalities, a
behavior-simulation slot, the terminal hatch flow, and a closing call to action.

## Stack

- Next.js 14 (App Router, React 18, TypeScript)
- UI from [`@pets-driven/design-system`](../../packages/design-system) — tokens,
  `Button`, and `PetAvatar`. Add new shared components there, not here.

## Develop

From the repo root (pnpm workspaces):

```bash
pnpm install
pnpm --filter @pets-driven/web dev      # http://localhost:3000
pnpm --filter @pets-driven/web build    # production build
pnpm --filter @pets-driven/web start     # serve the build
```

## Structure

- `app/layout.tsx` imports `@pets-driven/design-system/styles.css` (tokens +
  fonts + base reset) via `globals.css`, which also defines the page-level scene
  keyframes.
- `app/page.tsx` renders `components/Intro.tsx`.
- `components/Intro.tsx` — the scroll-driven scenes. The scroll/reveal/hatch
  controller lives in a single `useEffect`; CSS custom properties (`--p`, etc.)
  drive the cinematic transitions.

The design system ships raw TSX (with co-located component CSS) from the
workspace, so the app sets `transpilePackages: ["@pets-driven/design-system"]`
in `next.config.mjs`.

## Remotion Service Demo

The service introduction video lives in `remotion/index.tsx` and exposes the
`ServiceDemo` composition.

Useful commands:

- `pnpm --filter @pets-driven/web video:studio` starts Remotion Studio.
- `pnpm --filter @pets-driven/web video:compositions` lists available
  compositions.
- `pnpm --filter @pets-driven/web video:still` renders a smoke-test still frame
  to `workspaces/service-demo-frame.png`.
- `pnpm --filter @pets-driven/web video:render` renders the demo video to
  `workspaces/service-demo.mp4`.
