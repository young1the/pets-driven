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
