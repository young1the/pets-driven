# Desktop development fixtures

Run the desktop frontend on its Tauri development port:

```powershell
pnpm --filter pets-driven dev:tauri
```

Open a fixture directly with `http://localhost:1420/?fixture=<id>`. A fixture
selector appears in the lower-right corner while a fixture is active, so the
scenario can be changed without editing the URL.

Available fixtures:

- `onboarding`: empty first-run state
- `onboarding-empty`: first-run state with no installed Pet Assets
- `home`: a small adopted-pet roster
- `mixed`: at-home, deployed, unbound, scaled, and archived pets
- `crowded`: ten at-home cards for layout stress testing
- `edit`: a populated Pet details screen
- `settings`: populated settings and launch configuration
- `debug`: debug controls with a populated roster
- `playground`: the Simulation playground inside the desktop shell

Fixture state is in-memory and is only enabled for development builds served
from a loopback hostname. It does not read or overwrite persisted Tauri state.

## Pet window fixtures

The pet window is a separate 192x268 always-on-top overlay window in the real
app, loaded from its own lean `pet-window.html` entry so a full roster of pets
does not each hold the main window's bundle. In Tauri its appearance is driven
by `PET_WINDOW_FRAME_EVENT`s from the main window, while its position comes
from the `place_pet_windows` batch the main window sends the shell once per
frame — an overlay never moves itself. To inspect it in a plain browser tab,
open
`http://localhost:1420/?surface=pet-window&fixture=<id>` — this seeds the
sprite/overlay presentation that would otherwise come from the frame stream,
and pins the page to the real window's fixed size with a checkerboard backdrop
(the surface itself stays transparent). A fixture selector appears in the
lower-left corner while a fixture is active.

The quickest way to open it: while any `?fixture=` desktop fixture is active,
click "Open pet window ↗" in the fixture switcher — it opens the first pet
window fixture in a new tab.

Settings → Pet windows switches the app to single-window overlay mode, where
one transparent, click-through window covers the whole desktop and every pet is
an element inside it (`pet-window.html?surface=pet-overlay`). It is driven by a
single `PET_OVERLAY_FRAME_EVENT` per tick carrying the whole roster, positions
included, so nothing native moves. There is no browser fixture for it: the
surface has no roster of its own to seed — it draws whatever the frames carry —
and the fixtures above already cover how a single pet looks.

Available fixtures (`apps/desktop/src/pet-window/pet-window-fixtures.ts`):

- `idle`, `running`, `jumping`: core animation states
- `speech`, `attention`: overlay badges
- `chatting`: social session with a partner name in the status card
- `agent-working`, `agent-failed`: agent-channel overlay states
- `long-name`: status-card overflow checks
- `large-scale`: resized above the default scale

Same gating as the main fixtures: development builds served from a loopback
hostname only.
