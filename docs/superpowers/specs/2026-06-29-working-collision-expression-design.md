# Working Collision Expression Design

## Goal

When a pet is in `AgentTaskState.status === "working"`, collisions should be
shown as short personality-driven expression beats, not as long behavior
detours. The agent is still working; the collision is display flavor.

## Principles

- `AgentTaskState.status === "working"` remains the source of truth for the
  task lifecycle.
- Collision expression must not imply that the real agent stopped working.
- Working sub-behaviors (`working-focus`, `working-wander`) are temporary
  display choices inside the working state and may be reset by collision.
- Physical overlap resolution remains the job of the existing collision escape
  movement, not the expression system.
- Personality remains visible: difficult or anxious pets react more sharply;
  calm pets react briefly or mildly.

## New Component

Add a visual-only expression component:

```ts
type PetExpressionStateComponent = {
  type: "PetExpressionState";
  source: "collision";
  mood: PetMood;
  emote: PetEmoteKind;
  label: string | null;
  startedAt: number;
  expiresAt: number;
};
```

This component does not own movement, intent, task state, or behavior claims.
It is presentation state only.

## Working Collision Flow

When `CollisionBehaviorSystem` detects a collision for a working pet:

1. Keep `AgentTaskState.status` as `working`.
2. Clear any active `MotionTarget` from `working-wander`.
3. Expire the current `working-focus` or `working-wander` claim so the next
   working sub-behavior can be selected again.
4. Write `PetExpressionState` with a personality-derived mood, emote, label,
   and duration.
5. Do not enqueue a long collision behavior token for working pets.
6. Let `CollisionEscapeSystem` handle short physical separation.
7. Let `WorkingBehaviorSystem` choose `working-focus` or `working-wander`
   again on its next pass, even while the expression overlay is still visible.

The visual rhythm should be:

```text
working-focus or working-wander
-> collision expression beat starts
-> working-focus or working-wander is reselected immediately
-> expression expires independently
```

## Personality Mapping

Expression intensity is derived from OCEAN:

- High neuroticism increases sharpness and duration.
- Low agreeableness increases irritation.
- High agreeableness softens the reaction and may show a friendly emote.
- High conscientiousness shortens the reaction because the pet returns to work
  quickly.
- High extraversion can make the reaction more animated, but should not turn
  working collisions into long social behavior.

Initial mapping:

```text
if neuroticism >= 0.65 or agreeableness <= 0.3:
  mood = "confused"
  emote = "exclaim"
  label = "!"
else if agreeableness >= 0.75 and neuroticism <= 0.35:
  mood = "love"
  emote = "heart"
  label = null
else if conscientiousness >= 0.75 or neuroticism <= 0.2:
  mood = "working"
  emote = "none"
  label = null
else:
  mood = "thinking"
  emote = "question"
  label = null
```

This mapping intentionally reuses existing design-system moods and emotes. It
does not require a new angry mood in the first implementation.

## Personality-Derived Duration

Expression duration should also be personality-driven:

```text
durationMs =
  550
  + neuroticism * 350
  + (1 - agreeableness) * 200
  + extraversion * 100
  - conscientiousness * 250
```

Clamp the result to `350..900` ms.

Examples:

- Steady or zen pets react briefly and return to work quickly.
- High-neuroticism or low-agreeableness pets show a longer irritation beat.
- Highly extraverted pets can be a little more animated, but still remain under
  the upper clamp.

## Rendering

Snapshots should expose the active expression separately from behavior
decisions. Rendering should prefer active expression over decision emotes for
the short expression window. This preference is visual only; it must not block
working sub-behavior selection.

The expected UI layering is:

- Status bubble: still communicates working state.
- Expression emote: temporarily shows collision emotion.
- Sprite animation: resumes working focus or travel after reselection.

## Expiration

Add a small expiration system that removes `PetExpressionState` when
`expiresAt <= now`. The system should run before rendering snapshots are read
for a frame and should not mutate movement, behavior claims, or agent task
state.

## Non-Goals

- Do not add a new angry mood or emote yet.
- Do not convert working collision into a long `collision-flee`,
  `collision-engage`, or `collision-avoid` movement.
- Do not change `AgentTaskState.status` away from `working`.
- Do not block real agent task progress.
