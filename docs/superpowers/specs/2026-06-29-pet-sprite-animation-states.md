# Pet Sprite Animation States

Reference spec for the 9-row sprite atlas used by all pets in this project.
Matches the `$hatch-pet` skill contract and the `PetAnimationState` type in
`packages/pet-engine/src/pets/assets/pet-atlas.ts`.

## Atlas Layout

- Cell size: **192 x 208 px** per frame
- Atlas size: **1536 x 1872 px** (8 frames x 9 rows)
- Format: WebP with transparency

## Row Contract

| Row | State           | Frames | Mirror rule               |
| --- | --------------- | ------ | ------------------------- |
| 0   | `idle`          | 6      | Mirror for right-facing   |
| 1   | `running-right` | 8      | Never mirror; directional |
| 2   | `running-left`  | 8      | Never mirror; directional |
| 3   | `waving`        | 4      | Mirror for right-facing   |
| 4   | `jumping`       | 5      | Mirror for right-facing   |
| 5   | `failed`        | 8      | Mirror for right-facing   |
| 6   | `waiting`       | 6      | Mirror for right-facing   |
| 7   | `running`       | 6      | Mirror for right-facing   |
| 8   | `review`        | 6      | Mirror for right-facing   |

Frame timings are defined in `PET_ANIMATION_DURATIONS` in `pet-atlas.ts`.

## State Semantics

### `idle` (row 0)

Quiet resting state. Subtle breathing, tiny blink, slight head bob, or small
material sway. Every frame must be visually distinct; no six identical copies.
Do not show waving, walking, working, large gestures, or new props.

### `running-right` (row 1) / `running-left` (row 2)

Directional travel movement. Body, limbs, and props move with the direction of
travel. The two rows are separate sprites, or a mirror of row 1 only when safe.
Cadence must visibly alternate across all frames. Do not show speed lines, dust
clouds, floor shadows, or motion trails.

### `waving` (row 3)

Friendly greeting. Show the wave through paw, hand, wing, or limb pose change
only. Do not show wave marks, motion arcs, sparkles, or floating effects.

### `jumping` (row 4)

Vertical motion through body position only: crouching, launch, peak, and land.
Do not show shadows, dust, landing marks, or floor cues.

### `failed` (row 5)

Task failure state. Attached tears, smoke puffs, or stars are allowed if
physically touching the pet. Do not show red X marks, floating symbols, or
detached effects.

### `waiting` (row 6)

The agent needs user input or approval. Show an expectant, asking pose. Must
look distinct from both `idle` (quiet) and `review` (scrutinising).

### `running` (row 7)

This is the focused work state, not literal running. Show active concentration:
typing, scanning, processing, or thinking. The pet should look absorbed in a
task. Do not show foot-running, jogging, raised knees, pumping arms,
directional travel, or any locomotion cues. This row is mapped to the `working`
intent in code.

### `review` (row 8)

Careful examination. Show focus through lean, eye direction, head tilt, or
paw/hand position. Do not add new props (magnifying glasses, papers, UI) unless
they are part of the pet's base identity.

## Code Mapping

```text
PetSpriteIntent "working"      -> animationState "running"       (row 7)
PetSpriteIntent "travel/right" -> animationState "running-right" (row 1)
PetSpriteIntent "travel/left"  -> animationState "running-left"  (row 2)
```

During `AgentTaskState.status === "working"`:

- Pet still (no motion target) -> shows row 7 (`running`, focus pose)
- Pet moving (motion target set by `WorkingBehaviorSystem`) -> shows row 1 or 2
  (travel)

Personality governs which happens: high `conscientiousness` stays still; low
`conscientiousness` plus high `extraversion` wanders with travel animation.

### Autonomous expressive poses

The five status-flavoured rows (`waving` / `failed` / `waiting` / `running` /
`review`) are not agent-only. A family of sustained, stationary "expressive
pose" activities in `BehaviorDecisionSystem` lets ordinary autonomous pets
exercise them, each personality-shaped (OCEAN). While one is active the pet
holds a `stand` steering claim named for the gesture, and
`getPetAnimationState` maps that claim reason to the row:

```text
BehaviorDecisionState.reason "greet"   -> "waving"  (row 3)  — high E/A
BehaviorDecisionState.reason "groom"   -> "running" (row 7)  — high C
BehaviorDecisionState.reason "observe" -> "review"  (row 8)  — high O
BehaviorDecisionState.reason "beckon"  -> "waiting" (row 6)  — lonely, agreeable
BehaviorDecisionState.reason "fret"    -> "failed"  (row 5)  — high N
```

These only apply to autonomous claims and require no `TaskMovementHold`, so
they never collide with the agent-task poses, which still win via the hold.

## Effect Constraints

All effects must be:

- Physically attached to or overlapping the pet silhouette
- Inside the same frame slot as the pet
- Opaque and hard-edged enough for clean extraction
- Small enough to remain readable at 192 x 208

Forbidden by default: wave marks, motion arcs, speed lines, afterimages,
detached stars or sparkles, floating punctuation, cast shadows, glow, halo,
aura, soft transparent effects, text, labels, speech bubbles, or scenery.
