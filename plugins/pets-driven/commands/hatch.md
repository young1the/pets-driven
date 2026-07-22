---
description: Create (hatch) a pets-driven pet for the current folder, choosing its asset and personality.
allowed-tools: Bash(*)
---

Guide the user through creating a new pets-driven pet bound to a project folder.
Do the steps in order, one prompt at a time, and stop if the user cancels.

The desktop app owns pets-driven's data — its state file and its pet asset
folders. Ask it through the commands below; never read those paths off disk
yourself (no `~/.petdex/pets`, no `~/.codex/pets`, no state file). Only the app
knows where they currently live and which folder the user designated.

1. **Confirm the folder.** Default to the current working directory. Show it and
   ask whether to use it or a different existing path. This becomes the pet's
   home folder (`cwd`).

   Check what the app already has before hatching anything:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward list
   ```

   Each pet comes back as `{"id","name","assetId","personalityId","cwd",…}`. A
   folder holds at most one pet, so if one already reports this `cwd`, say so and
   stop — there is nothing to hatch. **A pet's `cwd` can be `null`**: that pet
   exists and is fine, it just has no folder bound and receives no agent events.
   If the user would rather adopt one of those than create a new pet, bind it
   instead of hatching (see step 6) and skip the rest.

2. **List what the app accepts.** Ask the app for the hatchable assets and the
   personality presets:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward options
   ```

   The response is
   `{"ok":true,"assets":[{"id","displayName","description","bundled"}],"personalities":[{"id","traits"}]}`.
   Present the assets by `displayName` (`bundled: false` ones come from the
   user's own pet folder) and let the user pick one — its `id` is `assetId`. If
   `assets` is empty, tell the user to install a pet asset first and stop.
   `{"ok":false,"error":"app-not-running"}` means the desktop app is simply not
   open — that is not a failure, so mention it plainly and stop.

3. **Recommend a personality.** Read the chosen asset's `description` and
   recommend the best-fitting preset from the `personalities` the app just
   returned, then let the user decide. That list is authoritative; these are the
   presets it currently ships, by their leading behavior:
   - `playful` — romps and chases; explores and engages freely.
   - `attentive` — keeps watch and seeks the user readily.
   - `reserved` — peeks from a distance; cautious, stays close.
   - `curious` — inspects everything; investigates new space.
   - `steady` — follows a routine; calm and deliberate.
   - `bold` — struts, unfazed by collisions, approaches readily.
   - `gentle` — offers comfort; unhurried and hyper-agreeable.
   - `mischievous` — feints and pesters; restless troublemaker.
   - `lazy` — naps through most of the day.
   - `zen` — meditates; unbothered by anything around it.
   - `aloof` — withdraws and keeps to itself.
   - `skittish` — stands lookout and flees from contact.

   The chosen id is `personalityId`.

4. **Ask for a name** for the pet.

5. **Create the pet.** Pass the collected values as plain, shell-quoted
   arguments — do **not** hand-write JSON, and do **not** escape the path
   yourself. The script builds the request and escapes the path safely:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward hatch "<assetId>" "<name>" "<personalityId>"
   ```

   This uses the current folder. To target a different folder, append it as a
   final argument: `... "<personalityId>" "<that folder>"`. Quote each value;
   the script handles Windows backslashes for you.

6. **Report the result** from the command output:
   - `{"ok":true}` → the pet was created; tell the user to look at their desktop.
   - `{"ok":false,"error":"app-not-running"}` → the desktop app is not open. Say
     that plainly, without treating it as an error, and let them retry once it
     is running.
   - `{"ok":false,"error":...}` → report the error (e.g. the folder already has a
     pet).

## Binding an existing pet instead

A pet and a folder are separable: a pet with `cwd: null` is waiting for one, and
a bound pet can be released without being deleted. Both go through the app:

```bash
# bind this pet to the current folder (append a folder to target another)
"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward bind "<petId>"
# release the pet from its folder — the pet keeps existing with cwd null
"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward unbind "<petId>"
```

Take `<petId>` from `forward list`. Binding answers `{"ok":true,"pet":{…}}` with
the pet's new state, or `{"ok":false,"error":...}` when that folder already
belongs to another pet — release that one first, or pick a different folder.
