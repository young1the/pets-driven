---
name: attach
description: Use when the user asks to attach, ping, verify, or connect the current Codex thread or terminal to the pets-driven pet for the current working directory.
---

# Attach pets-driven

This Codex skill shares the Claude command workflow in
`../../commands/attach.md`.

Read that command file first, then follow the same user-facing workflow. When
the command file refers to `${CLAUDE_PLUGIN_ROOT}`, use this plugin root instead:

- In an installed Codex hook context, the bundled hook config resolves the installed cache path.
- In this repository while developing, use `plugins/pets-driven`.

The verification command is:

```bash
plugins/pets-driven/hooks/run-hook.cmd forward attach
```

After running it, tell the user to look at their pet. If the pets-driven desktop
app is running and a pet is adopted on this folder, the pet enters its attention
state. If nothing happens, remind them that the desktop app must be running and
the current folder must be adopted as a pet.
