# crates

The Rust side of pets-driven: a Cargo workspace of four library crates plus the `pdd` command-line binary. This is the authoritative Pet + Registered Working Directory state and the wire contract the desktop app and CLI share. The desktop Tauri crate (`apps/desktop/src-tauri`) is a workspace member too, but it belongs to the `apps/desktop` module — these crates never depend on it. See the repo-root `CONTEXT.md` for the domain language and `ARCHITECTURE.md` for how the Rust side connects to the apps.

## Commands

```bash
cargo test -p pets-driven-core       # one crate's suite
cargo test --workspace               # every Rust crate
cargo build -p pets-driven-cli       # builds the pdd binary into target/
cargo run -p pets-driven-cli -- status   # run pdd without installing
```

## Crates

| Path | What it owns | Depends on |
| --- | --- | --- |
| `pets-driven-core` | Authoritative Pet + Registered Working Directory behavior behind a `StateRepository` seam (`model.rs`, `commands.rs`, `queries.rs`, `state_v1.rs`) | serde, serde_json, thiserror only |
| `pets-driven-fs` | The production `FileStateRepository`: the on-disk `state.v1.json` plus an `fslock` cross-process lock | core, fslock, dirs |
| `pets-driven-protocol` | The loopback wire contract — routes and message shapes for the desktop ingress; transport-free | serde only |
| `pets-driven-git` | Git worktree behavior: where a worktree goes, what git is asked, and which requests are refused before it is. Knows nothing about pets | core (for one path normalization), serde |
| `pets-driven-cli` | The `pdd` binary: direct state ops (`status`/`list`/`hatch`/`bind`/…), git worktrees with a pet each (`worktree add`/`ls`/`rm`), and live signals (`show`/`hide`/`forward`) | core, fs, protocol |

`pdd`'s own reference lives in `pets-driven-cli/README.md` (full subcommand table, the worktree commands, and the Orca worktree-hook setup).

## Cross-module dependencies

- Dependency arrows: `fs → core`; `git → core`; `cli → core, fs, git, protocol`; the desktop crate adds `git` to the `core` + `fs` it already had. Nothing here depends on the desktop crate or on any workspace TypeScript package. Keep it that way so `pdd` links the core without pulling in the Tauri shell.
- Consumed by `apps/desktop/src-tauri`, which depends on `core` + `fs` (and the desktop's own ingress speaks `protocol`). A change to the `state.v1.json` shape (`state_v1.rs`) or the protocol messages ripples into the desktop; see `ARCHITECTURE.md`.

## Non-obvious rules

- **`pets-driven-core` must stay Tauri/Tokio/DOM-free** — serde, serde_json, thiserror only. The CLI links it directly, so a heavier dependency would drag the desktop stack into every `pdd` invocation.
- **The state file is resolved identically by the desktop and `pdd`:** `dirs::data_dir()/com.petsdriven.desktop/state.v1.json`, overridable with `PETS_DRIVEN_STATE_PATH` (it overrides *both*). The `fslock` cross-process lock serialises every write, so `pdd` works whether or not the app is running and can never race it.
- **A state write is durable; a hook event is not.** State commands (`hatch`, `bind`, `delete`, …) write the shared file directly and work app-down. `show`/`hide`/`forward` are live signals sent over the loopback ingress and no-op when the app is down.
- **Worktrees keep no registry of their own** (`pets-driven-git`). Git already records which folders are worktrees of which repository, so `list_worktrees` shells out to `git worktree list` and the caller binds an ordinary pet to the new folder — nothing in `state.v1.json` records that a folder is a worktree (the one field there, `worktreeDirectory`, only says where new ones go), and a worktree made with plain `git` still lists. Every git call goes through the `Git` seam, and `pets_driven_git::testing::ScriptedGit` is shipped (not test-only) so the desktop and CLI test their own behavior around git without creating repositories.
- **Where worktrees go is one setting, not two.** `worktreeDirectory` is an ordinary field of `state.v1.json` (core `SettingsPatch`, read back through `PetsDrivenCore::worktree_directory`), so the app's Settings screen and `pdd worktree` resolve the same folder without being configured separately. `pets-driven-git` never reads it — the root is passed into `plan_worktree`, and each caller decides the order it resolves one (both put `PETS_DRIVEN_WORKTREE_ROOT` first, as a per-shell override).
- **The worktree *policy* is in the crate; the *surface* is in each caller.** Which requests are refused before git is asked — the repository itself, uncommitted work, an occupied folder, a base for a branch that already exists — lives in `pets-driven-git` so `pdd worktree` and the app's dialog refuse the same things. What stays with the caller is what only it knows: the CLI's JSON envelopes and its refusal to delete the folder the shell is standing in, the app's dialog and its pet adoption.
- **The CLI binary is `pdd`, not `pets-driven`.** The name is deliberately distinct from the desktop crate's binary so the two never collide in the shared `target/` directory.
- **`pets-driven-protocol` stays transport-free** — no HTTP client, no Tauri, no filesystem, just message shapes and route constants. The CLI hand-rolls its loopback HTTP over `std::net` (`pets-driven-cli/src/transport.rs`) to avoid a Tokio/TLS stack for a plain-HTTP localhost call.
