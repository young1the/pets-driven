---
description: Create (hatch) a pets-driven pet for the current folder.
allowed-tools: Bash(*)
---

Guide the user through creating a new pets-driven pet bound to a project folder.
Do the steps in order, one prompt at a time, and stop if the user cancels.

Use the `pdd` CLI (on the user's PATH) for every pets-driven operation. It reads
and writes the shared state file directly and safely — a cross-process lock
keeps it from racing the desktop app — so it works whether or not the app is
running. Never hand-edit the state file yourself; go through `pdd`. (If `pdd` is
not installed, say so and stop.)

1. **Confirm the folder.** Default to the current working directory. Show it and
   ask whether to use it or a different existing path. This becomes the pet's
   home folder.

   Check what already exists before hatching:

   ```bash
   pdd list
   ```

   Each pet comes back as `{"id","name","assetId","personalityId","cwd",…}`. A
   folder holds at most one pet, so if one already reports this folder as its
   `cwd`, say so and stop — there is nothing to hatch. **A pet's `cwd` can be
   `null`**: that pet exists with no folder bound. Offer to `bind` it to this
   folder (see below) instead of hatching a new one.

2. **Ask for a name.** Nothing is required: an omitted name defaults to the
   bound folder's own name, the asset (look) and personality to a random pick,
   and the folder to the current directory. Suggest the folder's name and let
   the user accept it. Offer to let the user choose either:
   - **Personality** — run `pdd presets` for the authoritative id list, or
     recommend one from the leading behaviors below and pass `--personality`:
     - `playful` — romps and chases; explores and engages freely.
     - `attentive` — keeps watch and seeks the user readily.
     - `reserved` — peeks from a distance; cautious, stays close.
     - `curious` — inspects everything; investigates new space.
     - `steady` — follows a routine; calm and deliberate.
     - `feisty` — struts, quick to square up, approaches readily.
     - `gentle` — offers comfort; unhurried and hyper-agreeable.
     - `mischievous` — feints and pesters; restless troublemaker.
     - `lazy` — naps through most of the day.
     - `zen` — meditates; unbothered by anything around it.
     - `aloof` — withdraws and keeps to itself.
     - `skittish` — stands lookout and flees from contact.
     - `shrewd` — observes and calculates; cool, deliberate, self-directed.
   - **Asset (look)** — pass `--asset <id>`. Omit it for a random built-in pet.
     To browse the full catalog (including the user's own pet packs), open the
     desktop app.

3. **Create the pet.** Pass plain, shell-quoted arguments — `pdd` builds the
   request and escapes paths safely:

   ```bash
   pdd hatch                                             # name from the folder, random asset + personality
   pdd hatch "<name>"                                    # random asset + personality, current folder
   pdd hatch "<name>" --personality <id>                 # choose the personality
   pdd hatch "<name>" --asset <id> --personality <id> --cwd "<folder>"
   ```

4. **Report the result** from the command output:
   - `{"ok":true,"pet":{…}}` → the pet was created. If the desktop app is running
     it appears right away; otherwise it will on next launch.
   - `{"ok":false,"error":…}` → report it (e.g. the folder already has a pet).

## Binding an existing pet instead

A pet and a folder are separable: a `cwd: null` pet is waiting for one, and a
bound pet can be released without being deleted.

```bash
# bind this pet to the current folder (--cwd "<folder>" targets another)
pdd bind "<petId>"
# release the pet from its folder — the pet keeps existing with cwd null
pdd unbind "<petId>"
```

Take `<petId>` from `pdd list`. Binding answers `{"ok":true,"pet":{…}}` with the
pet's new state, or `{"ok":false,"error":…}` when that folder already belongs to
another pet — release that one first, or pick a different folder.
