---
name: hatch
description: Use when the user asks to hatch, create, adopt, or register a pets-driven pet for the current working directory from Codex.
---

# Hatch pets-driven

This Codex skill shares the Claude command workflow in
`../../commands/hatch.md`. Read that command file first, then follow the same
guided workflow one prompt at a time.

Every pets-driven operation goes through the `pdd` CLI (on the user's PATH). It
reads and writes the shared state file directly and safely — a cross-process
lock keeps it from racing the desktop app — so it works whether or not the app
is running. Never hand-edit the state file or the pet asset folders yourself; go
through `pdd`. If `pdd` is not installed, say so and stop.

The command shapes are:

```bash
pdd list                                       # existing pets + their cwd
pdd presets                                    # personality ids hatch accepts
pdd hatch "<name>"                             # random asset + personality, current folder
pdd hatch "<name>" --asset <id> --personality <id> --cwd "<folder>"
pdd bind "<petId>"                             # bind a pet to this folder (--cwd for another)
pdd unbind "<petId>"                           # release it (cwd -> null)
```

Only a name is required to hatch: the asset (look) and personality default to a
random pick and the folder to the current directory. Pass `--asset`,
`--personality`, or `--cwd` to choose any of them.

A pet's `cwd` may be `null` — that pet exists with no folder bound and receives
no agent events. Offer to `bind` such a pet rather than hatching a new one when
the user just wants a pet on this folder.
