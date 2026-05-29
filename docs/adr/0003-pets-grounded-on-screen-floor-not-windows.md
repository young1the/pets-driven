# Pets Are Grounded on the Screen Floor, Not on Real Windows

Accepted. Pets obey gravity and rest on a Screen Floor defined by the bottom of each monitor's work area (above the taskbar); the only surfaces in the MVP are screen edges. Pets do not detect or stand on real OS application windows. This matches the physics engine's defaults (downward gravity, static surfaces, a climbable-surface slot) and stays consistent with ADR 0001's decision that pets-driven does not track real OS window geometry or boundaries. We rejected a no-gravity free-floating model because it discards the "physically present on your desktop" appeal and the existing gravity and surface code. We rejected having pets climb and perch on real application windows even though it is more eye-catching, because it requires continuous OS window-geometry tracking that ADR 0001 placed out of scope.

Future direction: climbing and perching on real OS application windows is recorded as a desirable later-version goal — climbing pets are more visually striking — and is explicitly deferred because it depends on real-time OS window-geometry tracking.

Consequences: on multi-monitor setups the Screen Floor is stepped — each monitor's work-area bottom sits at a different world y — and is modeled with one static floor body per monitor work area.
