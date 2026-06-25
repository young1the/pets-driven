---
description: Bring a project repository into the current agent folder, via git clone (remote URL) or git worktree (local repo), then connect it to a pets-driven pet.
allowed-tools: Bash(*)
---

Populate an agent's working folder with the project it should work on. The
folder may be empty (freshly created for the agent) and you bring the project
repository into it, then hand it off to a pet. Do the steps in order, one prompt
at a time, and stop if the user cancels.

1. **Confirm the target folder.** Default to the current working directory. Show
   it and ask whether to use it or a different path. This is where the project
   lands and becomes the pet's home folder. For a `git worktree`, the folder
   must be empty or not yet exist; for a `git clone`, it must be empty or
   non-existent. If the folder already holds a repository, say so and stop —
   there is nothing to bring in.

2. **Ask for the source.** Find out where the project comes from. Two shapes:
   - A **remote URL** (e.g. `https://github.com/org/repo.git`, `git@…`) → clone.
   - A **local repository path** (a folder that is already a git repo) → add a
     worktree from it.

   If the source is ambiguous, ask. You can detect a local repo with
   `git -C "<path>" rev-parse --is-inside-work-tree`.

3. **Bring in the repository.**

   **Remote URL → clone.** Clone directly into the target folder:

   ```bash
   git clone "<url>" "<target-folder>"
   ```

   If the user wants a specific branch, add `--branch "<branch>"`.

   **Local repo → worktree.** A worktree gives the agent an isolated checkout on
   its own branch, leaving the source repo untouched. Ask for the branch:
   - **New branch** (default for isolated agent work) off the source's current
     HEAD or a base the user names.
   - **Existing branch** to check out as-is.

   Create it from the source repo (works even when the target folder already
   exists but is empty):

   ```bash
   # new branch
   git -C "<local-repo>" worktree add "<target-folder>" -b "<branch>"
   # existing branch
   git -C "<local-repo>" worktree add "<target-folder>" "<branch>"
   ```

   If `git worktree add` fails with a permission/sandbox error, tell the user
   and stop rather than retrying blindly.

4. **Verify.** Confirm the repo is in place and report the branch:

   ```bash
   git -C "<target-folder>" branch --show-current
   git -C "<target-folder>" worktree list   # for the worktree case
   ```

   Do not run dependency installs or builds unless the user asks — keep this
   step to bringing in the code.

5. **Connect the pet.** The folder is now ready for a pets-driven pet. If a pet
   is already adopted on this folder, ping it so it acknowledges the new work:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward attach
   ```

   If no pet is adopted yet, tell the user they can hatch one for this folder
   with `/pets-driven:hatch`. A connection error (non-zero exit, no JSON) just
   means the pets-driven desktop app is not running — the repository was still
   brought in successfully, so report success and mention the app must be running
   for the pet to react.

6. **Report the result:** the target folder, whether it was a clone or a
   worktree, the checked-out branch, and the pet connection status.
