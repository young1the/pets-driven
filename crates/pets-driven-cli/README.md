# pdd — pets-driven CLI

`pdd` is the command-line client for pets-driven. State commands read and write
the shared `state.v1.json` **directly** (through the same core and
cross-process-locked file the desktop app uses), so they work whether or not the
desktop is running and never race it. `show`, `hide`, and `forward` are live
signals to a *running* app.

The desktop installer ships `pdd` and adds it to your PATH.

## Commands

| Command | What it does | Needs the app running? |
| --- | --- | --- |
| `pdd status` | State file path and pet count | no |
| `pdd list` | Every pet in state | no |
| `pdd presets` | Personality ids `hatch` accepts | no |
| `pdd hatch <NAME> [--asset <ID>] [--personality <ID>] [--cwd <DIR>]` | Adopt a pet bound to a folder (asset, personality, and folder default to a random asset, a random personality, and the cwd) | no (also pings the app to show it) |

When `hatch` picks a random asset (no `--asset`), it prefers the pets you
installed in your designated pet source folder (`petSourceDirectory` in state,
otherwise `~/.petdex/pets`), and only falls back to the six built-ins when that
folder holds no pet. So once you add your own pets, new worktrees get *those*.
| `pdd bind <PET_ID> [--cwd <DIR>]` | Bind a pet to a folder | no |
| `pdd unbind <PET_ID>` | Detach a pet from its folder | no |
| `pdd delete [PET_ID] [--cwd <DIR>]` | Remove a pet (and hide its window) | no (hides best-effort) |
| `pdd show [CWD]` | Show the pet window for a folder | yes |
| `pdd hide [CWD]` | Hide the pet window for a folder | yes |
| `pdd forward [EVENT]` | Forward an agent hook event to the app | yes |

`pdd` and the desktop resolve the same state file automatically
(`<os data dir>/com.petsdriven.desktop/state.v1.json`); set
`PETS_DRIVEN_STATE_PATH` to override both.

## Orca worktree hooks

Give every Orca worktree its own pet by wiring `pdd` into Orca's worktree
scripts. `pdd` uses Orca's environment variables (`$ORCA_WORKTREE_PATH`,
`$ORCA_WORKSPACE_NAME`). Both scripts are best-effort — they never fail the
Orca step, and `hatch`/`delete` work even if the desktop app is not running (the
pet is written to shared state and shows up when the app is next opened).

**Setup script** (runs after a new worktree is created):

```bash
if command -v pdd >/dev/null 2>&1; then
  # Adopt a pet named after the workspace, bound to the new worktree folder.
  # Asset and personality are random.
  pdd hatch "${ORCA_WORKSPACE_NAME:-$(basename "$ORCA_WORKTREE_PATH")}" \
    --cwd "$ORCA_WORKTREE_PATH" >/dev/null 2>&1 || true
  # Ensure it is on screen (also covers a re-used folder where hatch is a no-op).
  pdd show --cwd "$ORCA_WORKTREE_PATH" >/dev/null 2>&1 || true
fi
```

**Archive script** (runs before a worktree is archived or removed):

```bash
if command -v pdd >/dev/null 2>&1; then
  # Remove the pet for this worktree.
  pdd delete --cwd "$ORCA_WORKTREE_PATH" >/dev/null 2>&1 || true
fi
```

Once a pet is bound to a worktree, the pets-driven plugin's agent hooks (running
inside that worktree) drive the pet's reactions to the agent's work — the Orca
scripts only create and remove the pet.
