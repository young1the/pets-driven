# MVP Uses Approximate Pet Hit Masks

Accepted. A Pet Hit Region should feel like only the visible pet body and visible overlay pixels receive pointer input, while transparent window pixels pass through to the desktop. For the MVP, pets-driven provides one default approximate body mask for the standard pet sprite plus separate compact overlay masks, instead of requiring asset packages to provide mask metadata, maintaining per-frame masks, or doing per-frame alpha-perfect pixel testing. Exact alpha testing depends on animation frame, scale, DPI, and native click-through behavior, so partner-provided mask metadata is a later extension rather than a birth requirement. If the approximation feels sloppy in product use, the implementation can be upgraded to asset-specific masks or alpha-perfect hit testing without changing the product model.

Overlay masks are action-only in the MVP: speech bubbles and attention badges may receive clicks for acknowledgement or context, but direct manipulation starts only from the body mask.

Secondary-click behavior follows the same split. The body mask opens the Pet Context Menu, while an overlay mask opens the Pet Overlay Menu for presentation controls on that speech bubble, attention badge, or emotional expression, such as minimizing the overlay.

Minimizing an overlay is presentation-only. It does not acknowledge or clear an Attention Hold; acknowledgement remains a separate overlay action or direct interaction with the pet body.

A minimized overlay keeps a compact visible indicator so the user can recover the expression or attention state, but the exact indicator design is intentionally undecided.

Direct manipulation acknowledges Attention Hold at pointer start on the body mask, matching the product meaning that the user has noticed and touched the pet.

Left-click behavior also depends on overlay type. Attention overlays acknowledge their Attention Hold, while speech and emotion overlays are presentation interactions only.

After acknowledgement, the hold is released and the pet may briefly show personality- and event-aware acknowledgement feedback before returning to normal behavior. This feedback is owned by the Simulation World and is caused by `user-interaction` behavior priority, not only by a Pet Window presentation layer, because it may affect movement, pose, speech, or other pet behavior; the exact animation or UI treatment is intentionally undecided.

If a new Attention-Producing Event arrives during acknowledgement feedback, the feedback is interrupted and a new Attention Hold is created. `task.waiting`, `attention.requested`, `task.failed`, and `task.completed` are attention-producing; `task.started` is not.

When multiple Attention-Producing Events arrive for the same pet, the current Attention Hold presents the latest event. Earlier events are retained in Attention History rather than stacked as multiple visible badges.

Attention History belongs to the Pet and is accessed from the Pet Context Menu or Management Surface; it is not represented as stacked overlays on the Pet Surface. It is session-local recent context, keeps up to five recent events per pet, and is not persisted across app restarts in the MVP.

Acknowledging an Attention Hold removes the current hold from the Pet Surface but does not remove the underlying event from Attention History. Retention and clearing are separate policy decisions.

Archiving a pet may discard Attention History because archive preserves reusable configuration and identity, not transient recent attention context.

Implementation acceptance criteria:

- Transparent sprite pixels pass clicks through to the app behind the Pet Window.
- Body mask clicks and drags start direct manipulation.
- Overlay mask clicks trigger overlay actions and do not start pet dragging.
- Moving individual Pet Windows does not interfere with normal IDE or browser work.
- Three to five simultaneous Pet Windows update position smoothly enough to feel alive.

These criteria must be verified in the real Tauri/native Pet Window implementation, not a browser-only mock, because OS click-through behavior, native hit testing, and drag latency are the core risks.
