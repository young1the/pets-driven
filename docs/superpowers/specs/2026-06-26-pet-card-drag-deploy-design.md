# Pet Card: Click-to-Detail & Drag-to-Deploy

## Background

On the main window home screen, pet cards fan out along the bottom. Today:

- **Card click** → `onDeploy(petId)` (send pet to the desktop)
- **Pencil button** (top-right of card) → `onEdit(petId)` (open detail/edit screen)

We are reworking the card interaction:

- **Card click** → open the detail screen (what the pencil does today)
- **Deploy to desktop** → drag the card up into a centre drop zone and release there ("dealing out a card")
- **Pencil button** → removed (click now covers it)

## Goals

- Clicking a card opens its detail screen.
- Dragging a card onto a centre drop zone and releasing deploys it to the desktop.
- A subtle drop zone is always visible in the centre and is emphasised while dragging over it.
- Remove the now-redundant pencil/edit button from the card on the home screen.
- No change to the parent wiring: `onDeploy` / `onEdit` / `onRecall` prop signatures stay the same.

## Non-Goals

- No drag library; implement with native Pointer Events.
- No change to the deploy/recall/edit business logic in `pets-driven-app.tsx`.
- No change to the `in the field` recall chips.
- No removal of the `onEdit` prop from the shared `PetShowcaseCard` design-system component (it remains a public prop; the home screen simply stops passing it).

## Interaction Model

All gestures are handled per fan card via Pointer Events in `home-section.tsx`.

| Event | Behaviour |
| --- | --- |
| `pointerdown` | Capture the pointer, record start `(x, y)` and the card id. Not yet "dragging". |
| `pointermove` | Once movement exceeds a threshold (~6px), enter "dragging": the card follows the cursor 1:1 (fan rotation removed, CSS transition disabled). Hit-test the cursor/card against the drop zone rect and track `over` state. |
| `pointerup` | Decide the outcome (below), release pointer capture, reset drag state. |

**Outcome on `pointerup`:**

1. Movement stayed under the threshold → treat as a **click** → `onEdit(petId)` (open detail screen).
2. Was dragging **and** released while over the drop zone → `onDeploy(petId)`.
3. Was dragging but released outside the drop zone → **spring back**: re-enable the CSS transition so the card animates to its original fan position; no deploy, no detail.

**Keyboard accessibility:** `Enter` / `Space` on a focused card opens the detail screen (`onEdit`), matching the new primary click action. (Deploy stays mouse/pointer-only; it is also reachable via the edit screen's deploy toggle.)

The existing `onClick → onDeploy` handler is removed.

## Drop Zone

- A subtle, always-visible rectangular dashed zone (a "field" — square dashed border, not a circle) centred in the hero region.
- Rendered behind the hero text (`Your pack` / `Good morning, Trainer!` / `Add a pet`) with `pointer-events: none` so it never intercepts clicks.
- Measured via a `ref` + `getBoundingClientRect()` for hit-testing during drag.
- While a card is dragging over it, the zone is emphasised (stronger border/background, slight scale) and the dragged card may show a "release to deploy" affordance.

## Pencil Button Removal

- `home-section.tsx` stops passing `onEdit` to `PetShowcaseCard`, so the pencil button no longer renders (the component only renders it when `onEdit` is provided).
- `PetShowcaseCard.onEdit` stays in the design-system API. The only app caller that passed it (the home screen) no longer does; `pet-edit-section.tsx` never passed it.

## Files Touched

- `apps/desktop/src/app/main-window/home-section.tsx` — drag state + pointer handlers, drop zone element/ref, click→detail wiring, remove `onEdit` pass-through.
- `apps/desktop/src/app/main-window/main-window.css` — drop zone styles, drag-active card style (transition disabled while dragging).
- Parent `pets-driven-app.tsx` — unchanged.

## Testing

- Click a card → detail screen opens (`onEdit` called).
- Drag a card onto the drop zone and release → `onDeploy` called once.
- Drag a card and release outside the drop zone → no deploy, card returns to its fan slot.
- A small jitter under the threshold still counts as a click, not a drag.
- The pencil button no longer renders on home cards.
- Drop zone visible at rest and emphasised on drag-over.
