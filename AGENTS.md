# AGENTS.md

## Project Notes

This project renders Codex-compatible pets in a browser playground. Pet spritesheets must follow the `$hatch-pet` 9-row atlas contract:

1. `idle`
2. `running-right`
3. `running-left`
4. `waving`
5. `jumping`
6. `failed`
7. `waiting`
8. `running`
9. `review`

Each cell is `192x208`. The final atlas is `1536x1872`.

## Sprite Direction Rules

- Do not collapse `running-right` and `running-left` into `running`.
- `running-right` and `running-left` are directional drag movement rows and should be selected directly from movement direction.
- `running` is a separate non-directional work/processing/focused-effort state. It is not the walk/run travel animation.
- Direction is inferred by comparing `Transform.position.x` and `MotionTarget.targetPosition.x`.
- Use `spriteFacing` only for states that do not have directional rows, such as `jumping`, `waiting`, `idle`, `waving`, `failed`, and `review`.
- Directional running rows should not be canvas-mirrored. If a pet package's directional row appears wrong, treat that as a pet asset issue rather than changing the global renderer contract.

## Asset Loading

- Default Codex pet assets are loaded from `/codex-pets/<asset-id>/spritesheet.webp`.
- If a Codex pet package is missing, fall back to `/fallback-pets/patamon/spritesheet.webp`.
- Keep the fallback asset under `public/fallback-pets/patamon/spritesheet.webp`.

## ECS Iteration And Performance

- Prefer `ComponentStore.forEach(...)` in hot system loops instead of `query(...)`.
- `query(...)` is for one-off reads, setup, and snapshot builders where an array result is useful.
- `forEach(...)` reuses its callback component tuple storage between entities. Destructure or read the tuple inside the callback and do not retain the tuple array after the callback returns.
- Component value mutation and immediate `setComponent` / `removeComponent` calls are part of the current system contract; later systems in the same tick should observe those changes.
- Avoid `map` / `filter` / `sort` chains inside per-entity hot loops when a single-pass loop can preserve the same behavior.

## Verification

Run focused tests after changing sprite or atlas logic:

```bash
npm.cmd run test -- tests/pets/pet-atlas.test.ts tests/core/pet-animation-state.test.ts tests/playground/canvas-renderer.test.ts
```

Run the full suite before claiming completion:

```bash
npm.cmd run test
```
