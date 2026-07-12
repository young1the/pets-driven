# Built-in pets

This directory is the **single source of truth** for the pets that ship with
Pets Driven. Each subdirectory is one pet, keyed by its asset id (the directory
name), and mirrors the layout the desktop app scans at runtime under
`~/.codex/pets/<id>/`:

```
pets/
  cato/
    pet.json          # displayName + description manifest
    spritesheet.webp  # the atlas sheet (8 cols x 9 rows of 192x208 cells)
  otto/ ...
```

## Who consumes these

- **Browser fixtures / previews** (web + desktop playground) read the sprites
  from each app's `public/codex-pets/<id>/`. Those copies are **generated** by
  `scripts/sync-pet-assets.mjs` and are git-ignored — never edit them by hand.
  Add or change a pet here and the sync (wired into each app's dev/build) keeps
  the public copies in step.
- **The engine's asset metadata** lives in
  `packages/pet-engine/src/pets/assets/codex-pet-fixtures.ts` (`CODEX_PET_ASSETS`).
  A test (`packages/pet-engine/tests/pets/built-in-pets.test.ts`) asserts that
  the constant and these manifests stay identical, so the two can't drift.

## Adding a pet

1. Create `pets/<id>/spritesheet.webp` and `pets/<id>/pet.json`.
2. Add a matching entry to `CODEX_PET_ASSETS`.
3. Run `pnpm sync-pets` (or just start an app — it runs automatically).
