# Dragging a Pet Is Host-Authoritative

Accepted. While a user drags a pet (direct manipulation), the Pet Window forwards the pointer position to the Simulation Host. The host moves that pet's body to follow the cursor as a kinematic body — gravity and movement behavior are suspended for that pet, while collision with other pets is still resolved — and broadcasts the resulting position back. On release the host restores gravity, so the pet falls and resumes normal simulation. Position stays owned by the host throughout, consistent with ADR 0005.

We rejected giving the Pet Window temporary local authority during the drag (moving its own window directly for a snappier feel) because it reintroduces the split authority ADR 0005 removed, and the host and window are co-located so event round-trip latency should be negligible.

Safety valve: if dragging feels laggy in the prototype, the active drag — and only the active drag — may fall back to local window authority, with the window reporting its position to the host for collision and handing authority back on release.
