# Motion Vocabulary: Decision, Locomotion, Steering (retire "intent")

Accepted. A **Pet**'s motion is modeled as a top-down chain — Drives → **Decision** → **Locomotion** → **Steering** → physics engine → animation — and the word "intent" is retired from the domain language. Previously one field (`PetIntent` = idle/active/seek, stored as `IntentState`) was doing three unrelated jobs at once: it named the chosen movement, it was the coarse motion mode read by the movement systems, and it was read by the Drives and Social systems as a "busy" flag. That overload was the main source of miscommunication when talking about the system ("what does intent mean here?"), because "intent" reads as a cognitive layer while the field is really a mechanical one — making it look as if a **Pet** had two brains.

The three jobs are now separate concepts: choosing what to do is the **Decision**; how the body moves (walking, climbing, flying, plus gait) is the **Locomotion**; and turning that into direction-and-force toward the target, right before the physics engine, is **Steering**. "Busy" is derived from whether a **Pet** holds an active **Decision**, not from a motion mode.

This layering follows established game-AI practice rather than being invented here: **Decision** is utility-style action selection (the same shape as The Sims' needs-weighted interaction scoring); **Steering** is Craig Reynolds' steering-behaviors layer (seek / arrive / flee / wander), which produces a force the motion engine integrates; and the split between "how the body moves" (Locomotion) and "how the engine pushes it" (Steering) is the standard actuation-vs-steering distinction (Millington, *AI for Games*).

The order is **Locomotion before Steering**, not the reverse, because that is what the engine already does: `LocomotionModeSystem` sets the `WalkingTag` / `ClimbingTag` / `FlyingTag` first, and the force systems (`WalkSystem`, `IntentSteeringSystem`, `WallClimbSystem`) each only run for a body carrying the matching tag. The locomotion mode therefore gates which steering force applies.

## Considered alternatives

- **Keep "intent" and just narrow it.** Rejected: "intent" and "decision" both read as "what the pet means to do," so keeping both left the two-brains confusion in place. One of the two words had to go, and the low mechanical layer is the one that is not really an intent.
- **Name the low layer `Locomotion`.** Rejected: `Locomotion` already means the walk/climb/fly body mode in this codebase (`LocomotionModeSystem`), so reusing it for idle/active/seek would collide. The idle/active/seek layer became **Steering** instead.

## Consequences

- The code still names the component `IntentState` / `PetIntent` and the system `IntentSteeringSystem`. CONTEXT.md is deliberately ahead of the code; a follow-up rename to `Steering` / `Locomotion` is expected, and until then readers should treat `IntentState` as **Steering**.
- The "busy" checks in the Drives and Social systems currently key off `intent !== "idle"`. Under this model they should instead key off the presence of an active **Decision**; that is a behavioral change to schedule with the rename, not a pure renaming.
- `speedFactor` (gait: the saunter-vs-romp multiplier) belongs to **Locomotion**, even though it is currently carried on `MotionTarget` and applied at the force step.
