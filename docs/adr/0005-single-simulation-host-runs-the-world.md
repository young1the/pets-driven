# A Single Simulation Host Runs the World; Pet Windows Are Renderers

Accepted. One Simulation Host runs the single Simulation World — stepping physics, collision, perception, and contact for every pet — and publishes each pet's world position to the Pet Windows. A Pet Window is a renderer: it moves its OS window to the position it is given and draws its sprite; it does not simulate. The host runs in a hidden host webview using the existing JavaScript world (`core/` and `features/physics`), not a per-window or Rust-ported simulation.

This supersedes the root prototype's decentralized model, where each pet window moved its own native window and the main window only broadcast board state. That model cannot satisfy our decision that pets share one world and physically collide, because a window simulating only its own pet has no knowledge of the others.

We chose a hidden host webview over a Rust port because it reuses the existing JS simulation unchanged and keeps the JS world canonical. The team will keep developing pet movement and personalities against that same JS simulation through the playground, so a single JS authority means the playground and the shipped Pet Surface exercise the same code.

Consequences: positions flow host → Pet Windows as world snapshots (`world-snapshot.ts`), and pet input from a Pet Window (e.g. dragging) must flow back to the host, which owns authoritative position. Snapshot broadcast cadence and that input-feedback contract are follow-on decisions.
