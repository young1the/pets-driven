# Pet Window Follows Its Pet and Grows On Demand

Accepted. Each Pet Window is sized to its pet's sprite and repositioned to follow the pet's projected world position, so the window itself is the pet's hit area (see ADR 0001). The window stays sprite-tight while the pet is idle or moving; it grows only while a transient overlay — a speech bubble or attention badge (a Pet Overlay Action) — is visible, then shrinks back.

We rejected a persistently larger window with reserved margin because its transparent margin would form a click-blocking dead zone that follows each pet around: the platform cannot pass clicks through only part of a window without a per-frame cursor-polling toggle. We rejected always running that cursor-polling toggle because growing on demand keeps click pass-through perfect in the common idle and moving states at no recurring cost.

Consequences: while an overlay is shown, the grown window's empty corners briefly block clicks behind it; and per-pet windows are repositioned at the simulation tick rate, whose smoothness on the target platform (and with many pet windows at once) should be confirmed by prototype. The prototype at the repository root already moves per-pet sprite-sized windows via setPosition, validating the core approach.
