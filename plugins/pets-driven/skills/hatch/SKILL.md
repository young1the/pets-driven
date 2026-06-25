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

- In an installed Codex plugin hook context, use `$PLUGIN_ROOT`.
- In this repository while developing, use `plugins/pets-driven`.

The create command shape is:

```bash
plugins/pets-driven/hooks/run-hook.cmd forward hatch "<assetId>" "<name>" "<personalityId>"
```

To target a different folder, append that folder as the final quoted argument.
The script builds JSON and escapes Windows paths safely, so pass plain quoted
arguments instead of hand-writing JSON.
