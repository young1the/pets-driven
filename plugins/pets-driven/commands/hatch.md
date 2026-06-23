---
description: Create (hatch) a pets-driven pet for the current folder, choosing its asset and personality.
allowed-tools: Bash(*)
---

Guide the user through creating a new pets-driven pet bound to a project folder.
Do the steps in order, one prompt at a time, and stop if the user cancels.

1. **Confirm the folder.** Default to the current working directory. Show it and
   ask whether to use it or a different existing path. This becomes the pet's
   watched folder (`cwd`).

2. **List installed assets.** Read the installed pet packages:

   ```bash
   for dir in ~/.codex/pets/*/; do
     [ -f "$dir/pet.json" ] && cat "$dir/pet.json"
   done
   ```

   Present the available assets by `id` and `displayName`. If none are found,
   tell the user to install a pet asset first and stop. Let the user pick one
   (its `id` is `assetId`).

3. **Recommend a personality.** Read the chosen asset's `description` and
   recommend the best-fitting preset, then let the user decide. The presets are:
   - `playful` — high openness + extraversion; explores and engages freely.
   - `attentive` — high extraversion + agreeableness; seeks the user readily.
   - `reserved` — high neuroticism, low extraversion; cautious, stays close.

   The chosen id is `personalityId`.

4. **Ask for a name** for the pet.

5. **Create the pet.** Build a compact JSON object and send it:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward hatch '{"cwd":"<cwd>","assetId":"<assetId>","name":"<name>","personalityId":"<personalityId>"}'
   ```

   Substitute the collected values. Keep the JSON on one line.

6. **Report the result** from the command output:
   - `{"ok":true}` → the pet was created; tell the user to look at their desktop.
   - `{"ok":false,"error":...}` → report the error (e.g. the folder already has a
     pet).
   - A connection error (non-zero exit, no JSON) → tell the user the pets-driven
     desktop app must be running, then they can retry.
