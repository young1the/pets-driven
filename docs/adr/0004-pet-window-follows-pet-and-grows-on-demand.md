# Pet Window Follows Its Pet and Grows On Demand

Accepted. Each Pet Window is sized to its pet's sprite and repositioned to follow the pet's projected world position. The window stays sprite-tight while the pet is idle or moving; it grows by fixed state-specific margins only while a transient overlay, such as a speech bubble or attention badge, is visible, then shrinks back. The exact overlay UI remains a product design decision.

We rejected a persistently larger window with reserved margin because its overlay area would follow each pet around even when no overlay is visible. The window must still use the Pet Hit Region approximation from ADR 0007 so transparent pixels pass through to the desktop instead of becoming click-blocking dead zones.

Consequences: speech bubbles and attention badges are expected to stay compact enough that a separate overlay window is not justified in the MVP. Per-pet windows are repositioned at the simulation tick rate, whose smoothness on the target platform and with many pet windows at once should be confirmed by prototype. The hit region approximation must also be confirmed by prototype because it may require native cursor hit testing or window click-through toggling. The prototype at the repository root already moves per-pet sprite-sized windows via setPosition, validating the core movement approach.
