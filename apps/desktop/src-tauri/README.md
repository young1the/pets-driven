# Desktop backend (`src-tauri`)

The desktop app's native backend exposes two separate surfaces:

- **Local HTTP ingress** — a loopback-only HTTP server other processes (Claude
  Code / Codex hooks, external tooling) call into. This is the "pets-driven
  API".
- **Tauri IPC commands** — native functions the bundled frontend calls via
  `invoke()`. Not reachable from outside the app.

## Local HTTP ingress API

Implemented in [`src/claude_hook_ingress.rs`](./src/claude_hook_ingress.rs).

- Base URL: `http://127.0.0.1:43187`
- Every route accepts `POST` only; a body is required only where noted.
- Every response is JSON with an `"ok"` boolean. Error responses add
  `"error": "<message>"`.
- `POST /pets-driven/api` returns this same table as machine-readable JSON
  (`{ "ok": true, "endpoints": [...] }`), generated from
  `api_endpoint_descriptors()` — treat that function as the source of truth
  if this table and the code ever drift.

| Method | Path | Request body | Success response | Description |
| --- | --- | --- | --- | --- |
| POST | `/pets-driven/api` | — | `200` `{ ok, endpoints }` | Index of every HTTP route this ingress serves. |
| POST | `/pets-driven/ping` | — | `200` `{ ok, app, status }` | Health check: confirms the ingress server is up and listening. |
| POST | `/pets-driven/options` | — | `200` `{ ok, personalities, assets }` | Lists every personality preset and every hatchable pet asset accepted by `/pets-driven/hatch`. |
| POST | `/pets-driven/list` | — | `200` `{ ok, pets }` | Lists every pet in state: id, name, assetId, personalityId, cwd, visible, archived, adoptedAt. |
| POST | `/pets-driven/pet` | `{ petId?, cwd? }` | `200` `{ ok, pet }` / `404` | Reads one pet by `petId` or by the `cwd` it's registered to (`petId` wins if both given). |
| POST | `/pets-driven/hatch` | `{ cwd, assetId, name, personalityId }` | `200` `{ ok }` / `400` / `409` | Creates a new pet bound to `cwd`. `409` if that folder already has a pet. |
| POST | `/pets-driven/pet/update` | `{ petId, name?, personalityId?, visible?, archived?, memo? }` | `200` `{ ok, pet }` / `400` / `404` | Patches one pet's editable fields. Only `petId` is required; omitted fields are left unchanged. |
| POST | `/pets-driven/pet/delete` | `{ petId }` | `200` `{ ok }` / `404` | Permanently removes a pet, its personality profile, and its registered working directory. |
| POST | `/pets-driven/show` | `{ cwd }` | `200` `{ ok }` / `404` | Shows the desktop window for the pet registered to `cwd`. |
| POST | `/pets-driven/hide` | `{ cwd }` | `200` `{ ok }` / `404` | Hides the desktop window for the pet registered to `cwd`. |
| POST | `/claude-hook` | Claude Code lifecycle hook event, forwarded unchanged | `200` `{ ok }` / `500` | Routes a Claude Code hook event to the pet whose registered `cwd` matches the event's `cwd`. |
| POST | `/codex-hook` | Codex lifecycle hook event, forwarded unchanged | `200` `{ ok }` / `500` | Same routing as `/claude-hook`, for Codex. |

Any other path returns `404 { ok: false, error: "Unknown ingress path" }`; a
malformed request (non-POST, unparsable JSON, missing `Content-Length`) is
rejected with `400` before routing.

## Tauri IPC commands

Registered in [`src/lib.rs`](./src/lib.rs) via `invoke_handler`. Called only
from the app's own frontend through `@tauri-apps/api`'s `invoke()`.

| Command | Module | Args | Returns | Description |
| --- | --- | --- | --- | --- |
| `get_claude_hook_ingress_status` | `claude_hook_ingress` | — | `{ url, state, error? }` | Current status of the local HTTP ingress (pending / listening / error). |
| `emit_test_claude_hook_ingress_event` | `claude_hook_ingress` | `cwd?` | `()` | Emits a synthetic hook event for the given (or current) `cwd`, for manual testing. |
| `get_claude_plugin_status` | `claude_plugin` | — | `ClaudePluginStatus` | Whether the Claude Code plugin is installed. |
| `install_claude_plugin` | `claude_plugin` | — | `ClaudePluginStatus` | Installs the bundled Claude Code plugin. |
| `uninstall_claude_plugin` | `claude_plugin` | — | `ClaudePluginStatus` | Uninstalls the Claude Code plugin. |
| `read_pets_driven_state` | `state_store` | — | JSON state | Reads the full persisted pets-driven state. |
| `write_pets_driven_state` | `state_store` | `state` | `()` | Overwrites the full persisted state document. Last-writer-wins, so it is reserved for the flows that own the whole document (the Settings reset) — every other mutation uses the four commands below. |
| `hatch_pet_record` | `state_store` | `input: { assetId, name, personalityId, cwd? }` | JSON state | Adopts a pet. Same as `POST /pets-driven/hatch`, except `cwd` may be null (a pet with no folder bound). |
| `update_pet_record` | `state_store` | `input: { petId, name?, personalityId?, visible?, archived?, memo?, scale?, cwd? }` | JSON state | Patches one pet. Omitted fields are left alone; `cwd: null` detaches the pet from its folder. |
| `delete_pet_record` | `state_store` | `petId` | JSON state | Removes a pet, its profile, and any working directory it holds. |
| `update_pets_driven_settings` | `state_store` | `input: { sessionCommand?, terminalShell?, petSourceDirectory? }` | JSON state | Patches the app-wide settings. |
| `list_codex_pet_packages` | `pet_assets` | — | `CodexPetPackage[]` | Lists pet packages found in the user's designated Petdex source folder. |
| `load_codex_pet_spritesheet` | `pet_assets` | `assetId` | binary IPC response | Loads a pet's spritesheet image bytes from the designated source folder. |
| `get_default_pet_source_directory` | `pet_assets` | — | `string` | Absolute path to the default Petdex pets root. |
| `open_adopted_pet_window` | `pet_windows` | `petId, assetId` | `()` | Opens the always-on-top overlay window for an adopted pet. |
| `open_pet_window_playground` | `pet_windows` | `count?` | `()` | Opens N playground pet windows for visual testing. |
| `close_pet_window_playground` | `pet_windows` | — | `()` | Closes all playground pet windows. |
| `close_all_pet_windows` | `pet_windows` | — | `()` | Closes every `pet-window-*` window. |
| `close_adopted_pet_window` | `pet_windows` | `petId` | `()` | Closes one adopted pet's window. |
| `open_pet_context_menu` | `pet_windows` | `petId, url, localX, localY` | `()` | Opens the native right-click context menu for a pet window. |
| `focus_window` | `terminal_channel` | `hwnd` | `bool` | Brings a foreign window handle to the foreground (Windows only; errors on other platforms). |
| `start_session` | `terminal_channel` | `cwd, command` | `ForeignWindow?` | Launches a terminal session in a foreign window (Windows only; errors on other platforms). |
| `connect_window` | `terminal_channel` | `timeoutMs?` | `ForeignWindow?` | Waits for and connects to a foreign window under the cursor (Windows only; errors on other platforms). |
| `terminal_open` | `embedded_terminal` | `cwd?, shell?, cols?, rows?` | `string` (session id) | Opens a new embedded PTY session. |
| `terminal_write` | `embedded_terminal` | `id, data` | `()` | Writes input to an embedded PTY session. |
| `terminal_resize` | `embedded_terminal` | `id, cols, rows` | `()` | Resizes an embedded PTY session. |
| `terminal_close` | `embedded_terminal` | `id` | `()` | Closes and removes an embedded PTY session. |
