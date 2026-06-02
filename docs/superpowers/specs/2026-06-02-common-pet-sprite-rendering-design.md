# Common Pet Sprite Rendering Design

## Goal

Create a shared pet sprite rendering contract so the browser playground, Pet Window surface, and future HTML-based views use the same atlas, frame timing, facing, mirroring, and sizing rules.

The current service has sprite logic split between the canvas playground and the Pet Window canvas. That makes it too easy for one surface to drift from the `$hatch-pet` 9-row atlas contract, especially around directional running rows and single-direction mirrored states.

## Scope

This slice introduces a small rendering layer under `src/pets/rendering/`.

It covers:

- resolving a visual pet state into a concrete atlas frame
- applying the project's directional running and mirror rules
- calculating source and destination dimensions
- drawing the resolved sprite frame on canvas
- rendering the same resolved sprite frame in HTML/React

It does not change the simulation model, ECS systems, Codex pet package format, native Pet Window authority model, or hit-region approximation.

## Architecture

The rendering layer is function-first.

`pet-sprite-frame.ts` owns the shared pure calculation:

- input: animation state, elapsed time, facing, body size, optional scale
- output: frame index, source rectangle, destination size, and mirror flag

`pet-sprite-canvas.ts` owns canvas drawing:

- input: canvas context, loaded `HTMLImageElement`, resolved frame, and center position
- behavior: draw the atlas cell at the requested position, applying horizontal mirror only when the resolved frame asks for it

`pet-sprite-html.tsx` owns HTML rendering:

- input: spritesheet URL, resolved frame, and display metadata
- behavior: render one atlas cell using a clipped element and CSS positioning or transforms

The canvas and HTML paths are intentionally separate adapters. They share the same resolved frame contract, not the same rendered DOM or canvas instance.

## Direction And Mirror Rules

The `$hatch-pet` row contract remains authoritative:

1. `idle`
2. `running-right`
3. `running-left`
4. `waving`
5. `jumping`
6. `failed`
7. `waiting`
8. `running`
9. `review`

`running-right` and `running-left` are directional movement rows. They must be selected directly from motion direction and must not be mirrored by the renderer.

`running` is the non-directional focused-effort state. It is not the travel animation.

Only states without directional rows may mirror for right-facing presentation: `idle`, `waving`, `jumping`, `failed`, `waiting`, and `review`.

## Data Flow

The Simulation World continues to publish `animationState`, `spriteFacing`, interaction scale, body size, and position through `WorldSnapshot`.

The playground canvas renderer converts each body snapshot into a resolved pet sprite frame and passes it to the canvas adapter.

The Pet Window view uses the same resolver for its current state and passes the result either to the canvas adapter or the HTML adapter, depending on the surface being rendered.

Future HTML surfaces can render pet previews with the HTML adapter without reimplementing atlas row math.

## Error Handling

Asset loading remains in the existing pet asset helpers. If a Codex pet package cannot be loaded, the existing Patamon fallback path stays in force.

The rendering resolver assumes a valid `PetAnimationState`. Unknown or missing animation states should be normalized by the caller to `idle`, matching the current canvas behavior.

## Testing

Focused tests should cover:

- `resolvePetSpriteFrame` returns the expected atlas source rectangle for every animation state
- directional running rows never request mirror
- single-direction states request mirror only when `spriteFacing` is `right`
- canvas drawing applies the resolved frame rather than recalculating atlas rules
- HTML rendering uses the same resolved frame contract for source position, size, and mirror
- existing sprite contract tests continue to pass

Run focused tests after implementation:

```bash
npm.cmd run test -- tests/pets/pet-atlas.test.ts tests/core/pet-animation-state.test.ts tests/playground/canvas-renderer.test.ts
```

Run the full suite before claiming completion:

```bash
npm.cmd run test
```
