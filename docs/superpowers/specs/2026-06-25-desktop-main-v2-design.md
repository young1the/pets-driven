# Desktop Main v2 — Design

Status: approved (2026-06-25)

Port the Claude Design project "Desktop Main v2" into the real desktop app as the
management window, replacing the current developer dashboard. The design is a
single-window app with a top nav and four sections. Reusable pieces are added to
`@pets-driven/design-system` first, then composed in `apps/desktop`.

Source design: `Desktop Main v2.dc.html` in the Claude Design project
`b2cd8e93-a810-4a2e-be9e-864e71d42220`.

## Scope

In scope: the four management-window sections (Home, Pet edit, Settings, Debug),
top nav, and a toast, wired to real `PetsDrivenState`, navigation, and Tauri
actions.

Out of scope (unchanged): the pet-window overlay surface, onboarding flow,
playground routing, and all simulation / Tauri / claude-hook plumbing in
`pets-driven-app.tsx`. We swap only the management UI (the `home` / `pets` /
`connect` branches).

## Token / primitive availability

The design references only tokens and components that already exist: `--blossom-*`,
`--coral-*`, `--mint-*`, `--sky-*`, `--butter-*`, `--lavender-*`, `--term-*`,
`--surface-*`, `--border-*`, `--text-*`, `--shadow-*`, `--ring-focus`, the
`--font-display` / `--font-body` / `--font-mono` families, and the `Switch`,
`Button`, `Badge`, and `Tabs` components. No token changes are required.

## New design-system components

Only the genuinely reusable, art-agnostic pieces move into the design system.
Page-specific layout stays in the app.

- `PetShowcaseCard` — the gradient pet card: role label, name, a **portrait
  slot** (passed in as children so the design system stays art-agnostic), a
  status pill (`{ label, tone, dotColor }`), an edit affordance, and the
  decorative wave background + scrim. Visual states: default, featured, hover,
  and "field treatment" (the send-to-field variant styling).
- `SegmentedControl` — a generic 2+ option segmented toggle. Used for the Shell
  (bash/cmd) picker.
- `TerminalPreview` — the dark "soft terminal" preview block (cwd line, prompt,
  command), built on the existing `--term-*` tokens.

Kept in the app (too page-specific for the design system):

- The showcase **fan** geometry and the "send to field" animation.
- The Settings and Debug section layouts.
- The top nav uses the existing `Tabs` component (it already supports icons and a
  controlled value).
- The "Add a pet" CTA reuses `Button variant="primary" size="lg"` with an icon
  rather than introducing a new variant.

## Sections

### Top nav

`Tabs` with Home / Settings / Debug, each with an icon. Controlled by the active
view; selecting a tab clears any open pet-edit screen.

### Home

- Greeting header ("Good morning, Trainer!").
- **Add a pet** CTA → navigates to the existing `OnboardingFlow` (not the mock
  `addPet`).
- **Showcase fan** of `PetShowcaseCard`s for pets that are _not_ currently
  deployed. Hover spreads the fan; clicking a card sends the pet to the field.
- **"In the field" chips** for deployed pets; clicking a chip recalls the pet.
- Toolbar: a count plus **Show all** / **Hide all** (deploy-all / recall-all).

### Pet edit

Reached from a card's edit button. Portrait (real `PetSprite`) plus a form:

- **Name** — edits `PetRecord.name`.
- **Working folder** — shows the linked `registeredWorkingDirectories` path.
  Editing reuses the existing directory-registration mechanism; if no
  folder-picker command exists yet, the field is display-only this pass.
- **Note** — edits the new `PetRecord.memo` field.
- **Deploy toggle** ("Show on desktop") — toggles `visible`.
- **Delete pet** — archives / removes the pet (existing reset/archive path).

### Settings

- **Double-click action** card wired to the real `sessionCommand`: a
  `SegmentedControl` for shell, a command `Input`, and a `TerminalPreview` that
  renders the resolved command for a sample pet. Edits persist via
  `desktopGateway.writePetsDrivenState`.
- **Claude agent hook** status card wired to the existing
  `get_claude_hook_ingress_status` (state, url, reconnect/test affordances).

### Debug

The current dev/test actions re-housed here, grouped: open/close pet windows,
open N pet windows, fixture windows, poke pet, test event, reset pets, reset
simulation, open playground.

### Toast

A transient bottom-center toast for confirmations (deploy, recall, delete).

## Data wiring

### Live status pill

New helper `petStatusFromSnapshot(snapshot)` derives `{ label, tone, dotColor }`
from the `PetSnapshot` the main window already simulates via `adoptedScenarioRef`:

- `heldAgentState`: `waiting` → "Needs you" (warning), `failed` → "Needs you"
  (danger), `completed` → "Done" (success).
- else from `intent` / `action`: working-ish → "Working" (info), otherwise
  "Idle" (neutral).
- a pet not present in the live world (not deployed, or no simulation) → "Idle"
  (neutral).

The home reads the same snapshot it already steps for projections; no second
simulation is created.

### Role = personality

Map `profile.personalityId` → its title (Playful / Attentive / Reserved /
Curious / Steady / Bold) via `PERSONALITY_OPTIONS`. Shown in the card role slot
and the edit portrait.

### Portrait = real sprite

Cards and the edit portrait render the pet's actual `PetSprite` (idle frame)
using the existing spritesheet-url loader, not the design's demo SVGs.

### New persisted field

`PetRecord` gains `memo?: string`. `parsePetsDrivenState` defaults it to `""`.
No schema-version bump is required (additive optional field).

## "Send to field" semantics

The existing `visible` flag already means "on the desktop as an overlay window."
The design's internal naming is inverted from this; we map to the real meaning:

- **Showcase fan** = pets not currently deployed (`visible === false`).
- **Send to field** (card click) = set `visible = true`, opening the overlay
  window. The card animates out.
- **"In the field" chips** = deployed pets (`visible === true`); clicking recalls
  them (`visible = false`, close overlay).
- **Show all / Hide all** = deploy-all / recall-all.

Deploy/recall reuses the existing `openAdoptedPetWindow` / `close_all_pet_windows`
paths and the `adoptedSimKey` rebuild that already reacts to `visible` changes.

## Testing

- `petStatusFromSnapshot` — unit tests over each `heldAgentState` kind, the
  intent/action fallbacks, and the not-in-world case.
- `PetRecord` migration/parse — `memo` defaults to `""` for state without it.
- Design-system components render with their documented props (smoke-level).
- Manual: deploy/recall a pet from Home, edit name/note, change the session
  command and see the terminal preview update, and exercise the Debug actions.
