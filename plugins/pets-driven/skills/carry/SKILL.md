---
name: carry
description: Use when an agent finishes or pauses work in a git worktree and you need to hand it to another agent — summarizing what was done and where it lives (worktree path, branch, source repo) into a compact handoff the next agent can pick up. Triggers on requests like "summarize this work for another agent", "hand off this worktree", "what did the agent do and where is it", or wrapping up isolated agent work. The counterpart to bring.
---

# Carry the work to the next agent

This Codex skill shares the Claude command workflow in
`../../commands/carry.md`.

Read that command file first, then follow the same guided workflow one prompt at
a time. When the command file refers to `${CLAUDE_PLUGIN_ROOT}`, use this plugin
root instead:

- In an installed Codex plugin hook context, use `$PLUGIN_ROOT`.
- In this repository while developing, use `plugins/pets-driven`.

The goal is a compact handoff another agent can act on: **what was done** and
**where it lives**. Collect the facts —

```bash
git rev-parse --show-toplevel             # worktree path
git worktree list                         # source repo + base context
git log --oneline <base>..HEAD            # commits added
git diff --stat <base>...HEAD             # files + line counts
git status --short                        # uncommitted work
```

— then write a short handoff block: location (worktree path, branch, source
repo), a plain-language summary of what changed and why, the commit list, and
where to `cd` to continue. Name the integration options (fast-forward merge,
cherry-pick, push + PR) only briefly; the next agent decides. Optionally ping the
bound pet that the handoff is ready:

```bash
plugins/pets-driven/hooks/run-hook.cmd forward attach
```
