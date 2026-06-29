---
name: bring
description: Use when the user wants to bring a project repository into the current agent folder — clone a remote repo or add a git worktree from a local repo — so a pets-driven pet has a project to work on. Triggers on requests like "bring the project into this folder", "clone the repo here", "set up the worktree for the agent", or populating a freshly created agent directory.
---

# Bring a project into the agent folder

This Codex skill shares the Claude command workflow in
`../../commands/bring.md`.

Read that command file first, then follow the same guided workflow one prompt at
a time. When the command file refers to `${CLAUDE_PLUGIN_ROOT}`, use this plugin
root instead:

- In an installed Codex hook context, the bundled hook config resolves the installed cache path.
- In this repository while developing, use `plugins/pets-driven`.

The repository comes in one of two shapes:

- A **remote URL** → `git clone "<url>" "<target-folder>"`.
- A **local git repo** → `git -C "<local-repo>" worktree add "<target-folder>" -b "<branch>"`.

The target folder must be empty or not yet exist. After the code is in place,
ping the pet so it reacts:

```bash
plugins/pets-driven/hooks/run-hook.cmd forward attach
```

To target a different folder, append that folder as the final quoted argument.
The script builds JSON and escapes Windows paths safely, so pass plain quoted
arguments instead of hand-writing JSON.
