---
description: Ping the pets-driven pet bound to the current folder to confirm the bridge is connected.
allowed-tools: Bash(*)
---

Send a one-off attention ping to the pets-driven desktop app for the current
working directory by running:

```bash
"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward attach
```

After running it, tell the user to look at their pet. If the pets-driven
desktop app is running and a pet is adopted on this folder, the pet enters its
attention state. If nothing happens, remind them that the desktop app must be
running and the current folder must be adopted as a pet.
