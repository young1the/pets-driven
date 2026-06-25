---
description: Summarize what an agent did and where the work lives (worktree path, branch, source repo) into a compact handoff another agent can pick up and continue. The counterpart to bring.
allowed-tools: Bash(*)
---

Hand an agent's work to the next agent. Agents usually work on an isolated
branch in a `git worktree`; when one finishes (or pauses), the next agent needs
two things to continue: **what was done** and **where it lives**. This skill
gathers both and produces one compact, paste-able handoff. Keep it factual and
short — the goal is for another agent to read it and immediately know where to go
and what state the work is in.

1. **Locate the work.** Find the worktree, its source repo, and the base branch:

   ```bash
   git rev-parse --show-toplevel          # this worktree's path
   git rev-parse --git-common-dir         # shared repo (differs in a worktree)
   git worktree list
   git branch --show-current
   ```

   The **base** is the branch this work will eventually rejoin (often the branch
   in the main worktree or the repo's default branch). If it is not obvious, ask
   rather than guess.

2. **Summarize what was done** relative to the base, then turn it into a short,
   plain-language description — not just raw git output. Read the commit messages
   and the diff so the summary captures *intent*, not only filenames:

   ```bash
   git log --oneline <base>..HEAD          # commits added
   git diff --stat <base>...HEAD           # files + line counts
   git status --short                      # uncommitted / untracked work
   ```

   Flag uncommitted work explicitly — another agent cloning or fetching the
   branch will not receive changes that are not committed yet.

3. **Write the handoff.** Produce a single block in this shape, filled with real
   values. This is the thing the next agent reads:

   ```
   ## Handoff
   Location:    <worktree-path>   (branch <branch>, base <base>)
   Source repo: <source-repo>
   Done:
     - <plain-language summary of what changed and why>
     - <…>
   Commits:     <oneline list, or "none committed yet">
   Files:       <X files, +A/-B>
   Uncommitted: <none | short list>
   Continue:    cd "<worktree-path>"   # already on branch <branch>
   ```

   Keep "Done" in the agent's own words — that is the part another agent cannot
   reconstruct from git alone.

4. **Point at integration only briefly.** The next agent decides how the work
   rejoins the base; just name the options so they know the shapes available —
   fast-forward merge, cherry-pick, or push + PR (all run from the source repo) —
   without spelling out full command sequences here.

   Optionally let the bound pet acknowledge the handoff is ready:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward attach
   ```

   A connection error just means the pets-driven desktop app is not running — the
   handoff still stands.
