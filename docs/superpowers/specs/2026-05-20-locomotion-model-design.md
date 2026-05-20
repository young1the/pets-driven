# Locomotion Model Design

Date: 2026-05-20

## Context

The current prototype models pet movement with locomotion components such as `WalkMovement`, `JumpMovement`, `WallClimbMovement`, and `FlightMovement`, plus a selected locomotion state. This was enough to make each movement visible, but it blurs several different concepts:

- A long-lived movement mode, such as walking or flying.
- A short-lived action, such as jumping.
- Environmental contact, such as standing on ground or touching a climbable surface.
- Behavior decisions, such as choosing to climb when a pet reaches a wall.

This causes awkward behavior. For example, representing jump as an active mode makes it easy to apply jump force every frame, which turns jumping into continuous upward thrust. It also makes `walk + jump` hard to express, even though a walking pet should be able to jump while continuing to walk.

## Decision

Split pet locomotion into four concepts: mode, action, contact, and behavior.

## Mode

A mode is the pet's current long-lived movement style. It answers: how is the pet generally moving right now?

Examples:

- `walk`
- `fly`
- `climb`

Mode should be persistent across frames. A walking pet can keep walking for many frames. A flying pet can keep flying for many frames. A climbing pet can keep climbing while it remains attached to a climbable surface.

Mode should not represent short impulses. `jump` should not be a base mode.

Expected component shape:

```ts
type LocomotionState = {
  type: "LocomotionState";
  baseMode: "walk" | "fly" | "climb";
};
```

## Action

An action is a short-lived movement event layered on top of the current mode. It answers: what one-shot movement should happen now?

Examples:

- `jump`
- `dash`
- `turn`
- `land`

Jump is an action, not a mode. A pet can walk and jump at the same time: walking controls horizontal movement, and jump adds a one-time upward impulse.

Expected component shape:

```ts
type JumpAction = {
  type: "JumpAction";
  requested: boolean;
};
```

The jump system consumes the request:

```ts
if (jump.requested && contact.grounded) {
  applyJumpImpulse();
  jump.requested = false;
}
```

## Contact

Contact describes what the pet is touching or near. It answers: what can the pet do in the current environment?

Examples:

- The pet is grounded.
- The pet is touching a wall.
- The pet is near a climbable surface.
- The pet collided with another pet.

Contact should come from physics and environment sensing, not from behavior preferences.

Expected component shapes:

```ts
type ContactState = {
  type: "ContactState";
  grounded: boolean;
  climbableSurfaceId: string | null;
};

type ClimbableSurface = {
  type: "ClimbableSurface";
};
```

Climbing should only be possible when the pet has a climb movement capability and contact with a climbable surface.

## Behavior

Behavior decides what the pet wants to do next. It answers: why is the pet moving?

Examples:

- Seek the user.
- Wander after reaching a destination.
- Climb when a climbable surface is nearby.
- Back away when another pet gets too close.
- Talk after being idle for a while.

Behavior should use mode, action, and contact as inputs. It can change the current mode, request actions, or update motion targets.

Example:

```txt
LikesClimbing + ContactState.climbableSurfaceId
  -> set LocomotionState.baseMode = "climb"

WalkMovement + obstacle ahead + ContactState.grounded
  -> request JumpAction
```

## Avoidance

The current `AvoidancePlanningSystem` predicts a waypoint before collision. This is useful for a clean prototype, but it makes avoidance feel global and planner-driven.

The preferred long-term direction is contact- and personality-driven reaction:

- A pet with `AvoidsCrowds` backs away or chooses a new path after detecting nearby pets.
- A stubborn pet may keep pushing forward.
- A jump-capable pet may hop over a low obstacle.
- A shy pet may stop and wait.

This means avoidance should become behavior logic driven by entity components, not a global precomputed waypoint system.

## Arrival

Pets should not simply stop forever when they reach a target. Arrival is an input to behavior, not the end of behavior.

Examples:

- A walking pet reaches a wall, detects a climbable surface, and starts climbing.
- A pet reaches the user anchor and starts idling nearby.
- A curious pet reaches a target, waits briefly, then wanders elsewhere.
- A talkative pet reaches the user and speaks if it has been idle too long.

Movement systems should handle how motion is executed. Behavior systems should decide the next goal after arrival.

## Proposed System Flow

```txt
ContactSystem
  Update grounded, wall, climbable, and nearby-contact state.

BehaviorSystem
  Choose goals, update motion targets, set base modes, and request actions.

WalkSystem / FlightSystem / ClimbSystem
  Apply continuous movement based on the selected base mode.

JumpSystem
  Consume jump requests and apply one-shot impulses when contact allows it.

PhysicsIntegrationSystem
  Apply forces and step the physics world.

PhysicsTransformSyncSystem
  Copy physics positions back to transforms.
```

## Implementation Direction

1. Rename or reshape locomotion state around `baseMode`.
2. Replace jump-as-mode with jump-as-action.
3. Add contact state for grounded and climbable-surface detection.
4. Add `ClimbableSurface` entities before making climb behavior automatic.
5. Gradually move avoidance from global waypoint planning into behavior components.
6. Add behavior that chooses the next action after arrival.

## Non-Goals

- Do not add an automatic dependency scheduler yet.
- Do not build a full behavior tree framework yet.
- Do not remove physics collision. The change is about where movement decisions are made, not about bypassing physics.
- Do not make every pet share the same avoidance response.
