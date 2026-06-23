# Hatch + Backend Persistence Authority — Design

Date: 2026-06-23

## Purpose

Add a CLI onboarding flow (`/pets-driven:hatch`) that creates a pet for the
current working directory, and move the **write authority** for that creation
into the Rust backend (`state_store.rs`) so persistent pet state is mutated by
the backend rather than only the frontend. This removes the two-writer race
that blocks a CLI-driven create.

## Scope

- **In scope:** a backend `hatch` mutation owning the create write + occupied
  detection, an HTTP `/pets-driven/hatch` endpoint, a frontend reload-on-change
  listener, and the plugin `/pets-driven:hatch` command.
- **Deferred (YAGNI):** moving the existing frontend GUI mutation logic
  (`adoptPet` / `registerWorkingDirectory` / schema migration) into Rust. Those
  stay in TypeScript. Full single-writer migration is a separate follow-up.

## Authority model

The on-disk `state.v1.json` is the shared source of truth. The backend is the
authority for the **hatch** write:

- `hatch_pet` takes a process-global lock, reads the current state file, applies
  the mutation, writes it back, and returns the new state. The lock serialises
  concurrent hatch requests.
- The frontend GUI mutation path (`write_pets_driven_state`) is unchanged. After
  a hatch, the backend emits `pets-driven:state-changed`; the frontend reloads
  via `read_pets_driven_state` and replaces its in-memory copy.

`// ponytail:` the GUI-write path stays frontend-owned; the tiny race between a
concurrent GUI write and a hatch is absorbed by the reload-on-change event,
which is sufficient for a single-user desktop companion. Full migration of GUI
writes through the backend is the upgrade path.

## Backend (`state_store.rs`)

### Personality presets

The three Personality Catalog presets are duplicated as Rust constants
(`playful` / `attentive` / `reserved`), each the exact object produced by the
factories in `packages/pet-engine/src/pets/personalities/factories.ts`. A
`// coupling:` comment names that file as the source of truth.

### `apply_hatch` (pure, unit-tested)

```
apply_hatch(
  state: &Value,
  input: HatchInput,            // { cwd, asset_id, name, personality_id }
  ids:   HatchIds,              // { pet_id, profile_id, working_directory_id, agent_source_id }
  now:   u64,                   // epoch ms
) -> Result<Value, HatchError>
```

- `HatchError::UnknownPersonality` when `personality_id` is not one of the three.
- `HatchError::Occupied { owner_pet_id }` when `cwd` (compared case-insensitively
  with separators unified) is already registered to a different pet.
- Otherwise returns a new state value with appended:
  - `pets[]`: `{ id, workingDirectoryId, assetId, profileId, name, adoptedAt: now, archived: false, visible: true }`
  - `petProfiles[]`: `{ id, petAssetId: assetId, personalityId, personality: <preset> }`
  - `registeredWorkingDirectories[]`: `{ id, path: cwd, petId, agentSourceId, createdAt: now, updatedAt: now }`

Mirrors the TS `adoptPet` + `registerWorkingDirectory` shapes exactly so the
frontend parses the result with no changes.

### Id + time generation (dependency-free)

`new_id(prefix)` → `{prefix}-{nanos}-{counter}` using `SystemTime` nanoseconds
and an `AtomicU64`. Matches `validate_asset_id` (alphanumeric + `-`). `now()`
returns epoch milliseconds. No `uuid`/`rand` crate added.

### `hatch_pet(app, input)`

Locks the global hatch mutex, reads the state file (reusing the read path),
calls `apply_hatch`, writes the result (reusing the write path), returns the new
state or the `HatchError` as a string.

## HTTP endpoint

`claude_hook_ingress.rs` currently rejects any path other than `/claude-hook`.
Generalise the connection handler to dispatch by path:

- `/claude-hook` → existing emit (unchanged behaviour).
- `/pets-driven/hatch` (POST) → parse `{ cwd, assetId, name, personalityId }`,
  call `state_store::hatch_pet`, on success emit `pets-driven:state-changed` and
  respond `{"ok":true}`; on `Occupied`/error respond `{"ok":false,"error":...}`
  with a 409/400 status so the agent reports accurately.

Shared HTTP helpers (`http_body_start`, `read_http_request`, etc.) are reused;
only request-line path routing and the new branch are added.

## Frontend

- `adapters/agent-events/hatch-ingress.ts`: export
  `PETS_DRIVEN_STATE_CHANGED_EVENT = "pets-driven:state-changed"`.
- `pets-driven-app.tsx`: one additive `useEffect` that listens for the event and
  reloads state via `desktopGateway.readPetsDrivenState()` →
  `applyPetsDrivenState`. The existing adopted-world effect then opens the new
  pet's window and simulates it. No other frontend change.

## Plugin

- `hooks/forward`: add a `hatch` mode — `forward hatch '<json>'` POSTs the JSON
  to `/pets-driven/hatch`. Unlike the fire-and-forget hook mode, it prints the
  response and propagates failure (`curl -sSf`, `exit $?`) so the agent can tell
  the user when the app is unreachable.
- `commands/hatch.md`: `/pets-driven:hatch` orchestration prompt. The agent:
  1. confirms the target folder (default `cwd`, allow another existing path),
  2. lists installed assets from `~/.codex/pets/*/pet.json`,
  3. reads the chosen asset's `description` and recommends a preset
     (playful / attentive / reserved), user decides,
  4. asks for a pet name,
  5. runs `forward hatch '{cwd,assetId,name,personalityId}'`,
  6. reports success ("check your desktop") or the returned error
     (occupied / app down).

## Verification

- Rust unit tests in `state_store.rs`: `apply_hatch` on empty state creates the
  pet/profile/directory with correct shapes; a second hatch on the same `cwd`
  returns `Occupied`; an unknown `personality_id` returns `UnknownPersonality`.
- Rust unit test in `claude_hook_ingress.rs`: a `POST /pets-driven/hatch`
  request parses to the expected JSON body and routes to the hatch branch.
- Manual end-to-end: app running, run `/pets-driven:hatch` in a folder, choose
  asset + personality + name, watch the pet appear on the desktop.

## Risks / notes

- Personality preset duplication in Rust must stay in sync with `factories.ts`
  (coupling comment). If presets gain fields, update both.
- `pets-driven-app.tsx` is under concurrent edits; the hatch listener is purely
  additive to minimise collision.
