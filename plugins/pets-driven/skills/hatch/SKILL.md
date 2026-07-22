---
name: hatch
description: Use when the user asks to hatch, create, adopt, or register a pets-driven pet for the current working directory from Codex.
---

# Hatch pets-driven

This Codex skill shares the Claude command workflow in
`../../commands/hatch.md`.

Read that command file first, then follow the same guided workflow one prompt at
a time. When the command file refers to `${CLAUDE_PLUGIN_ROOT}`, use this plugin
root instead:

- In an installed Codex hook context, the bundled hook config resolves the installed cache path.
- In this repository while developing, use `plugins/pets-driven`.

The pets-driven desktop app owns its own data — the state file and the pet asset
folders. Every lookup goes through it; do not read those paths off disk yourself
(no `~/.petdex/pets`, no `~/.codex/pets`, no state file). The command shapes are:

```bash
plugins/pets-driven/hooks/run-hook.cmd forward list     # existing pets + their cwd
plugins/pets-driven/hooks/run-hook.cmd forward options  # hatchable assets + personalities
plugins/pets-driven/hooks/run-hook.cmd forward hatch "<assetId>" "<name>" "<personalityId>"
plugins/pets-driven/hooks/run-hook.cmd forward bind "<petId>"    # bind a pet to this folder
plugins/pets-driven/hooks/run-hook.cmd forward unbind "<petId>"  # release it (cwd -> null)
```

`hatch` and `bind` use the current folder; to target a different one, append it
as the final quoted argument. The script builds JSON and escapes Windows paths
safely, so pass plain quoted arguments instead of hand-writing JSON.

A pet's `cwd` may be `null` — that pet exists with no folder bound and receives
no agent events. Offer to `bind` such a pet rather than hatching a new one when
the user just wants a pet on this folder.
