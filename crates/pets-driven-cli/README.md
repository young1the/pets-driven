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
| `pdd hatch [NAME] [--asset <ID>] [--personality <ID>] [--agent <AGENT>] [--cwd <DIR>]` | Adopt a pet bound to a folder (name defaults to the bound folder's own name; asset, personality, and folder default to a random asset, a random personality, and the cwd) | no (also pings the app to show it) |
| `pdd bind <PET_ID> [--cwd <DIR>]` | Bind a pet to a folder | no |
| `pdd unbind <PET_ID>` | Detach a pet from its folder | no |
| `pdd update [PET_ID] [--cwd <DIR>] <FIELD…>` | Edit a living pet in place: rename, re-skin, change personality, note, or size | no |
| `pdd note [TEXT] [--cwd <DIR>] [--pet <ID>] [--clear]` | Read, write, or erase the note on a pet's card | no |
| `pdd delete [PET_ID] [--cwd <DIR>]` | Remove a pet (and hide its window) | no (hides best-effort) |
| `pdd show [CWD]` | Show the pet window for a folder | yes |
| `pdd hide [CWD]` | Hide the pet window for a folder | yes |
| `pdd forward [EVENT]` | Forward an agent hook event to the app | yes |

When `hatch` picks a random asset (no `--asset`), it prefers the pets you
installed in your designated pet source folder (`petSourceDirectory` in state,
otherwise `~/.petdex/pets`), and only falls back to the six built-ins when that
folder holds no pet. So once you add your own pets, new worktrees get *those*.

## Updating a pet

`update` targets the pet by id, or — with no id — the pet bound to `--cwd`
(the current directory by default), the same way `delete` does. It patches only
the fields you pass and leaves the rest, including the folder binding, alone:

| Flag | Field |
| --- | --- |
| `-n, --name <NAME>` | Display name |
| `-a, --asset <ID>` | Pet asset — re-skins the pet, keeping its id, folder, and history |
| `-p, --personality <ID>` | Personality preset (`pdd presets` lists the ids) |
| `--agent <claude\|codex\|none>` | The agent this pet's session opens; `none` hands it back to the app-wide launch command |
| `--note <TEXT>` | The note on the pet's card; pass `""` to clear it (long-only: `-n` is `--name`) |
| `-s, --scale <FACTOR>` | Window scale, between 0.5 and 2 |
| `--swap-running-directions [BOOL]` | Trade the two running directions, for an asset whose spritesheet draws left/right the opposite way round. Bare means `true` |

```bash
pdd update --name "Atlas"                 # rename this folder's pet
pdd update --asset otto --personality zen # re-skin and re-temper it
pdd update --agent codex                  # this folder's pet opens Codex
pdd update --agent none                   # back to the app-wide launch command
pdd update "<petId>" --scale 1.5          # target a pet by id instead
```

A pet with no agent of its own opens whatever the app's launch command says
(Claude Code out of the box), so `--agent` is only needed for the folders that
differ. `pdd hatch --agent codex` sets it at Pet Birth, which is the shape a
worktree setup script wants.

At least one field is required — an `update` that would change nothing is a
usage error, not a silent no-op. The answer is the same `{"ok":true,"pet":{…}}`
envelope the other state commands print. A running desktop picks the change up
from its state watcher within a second; no restart needed.

## Notes on a pet

`note` is `update --note` with a shape built for notes: it reads as well as
writes, so the note you leave on a folder's pet is one command away in either
direction.

```bash
pdd note                          # print this folder's note
pdd note "chasing a flaky test"   # replace it
pdd note - <<'NOTE'               # take a multi-line note from stdin
release blocked on the ingress fix
retry after the desktop lands
NOTE
pdd note --clear                  # erase it
pdd note "…" --pet "<petId>"      # target a pet by id instead of by folder
```

The answer is note-shaped rather than the usual pet view (which carries no
note): `{"ok":true,"petId":"…","note":"…"}`, with `note` null when the pet has
never been given one. A note piped in with `-` loses its surrounding
whitespace, so a trailing newline from `echo` or a heredoc is not stored.

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
