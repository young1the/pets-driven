# Behavior Priority and Feature Architecture Design

## Goal

Make pet behavior feel alive by making the next-action decision path explicit in code, while reshaping the codebase toward feature-oriented modules instead of broad layer folders.

The next product focus is not deeper climb mechanics. The current climb flow is good enough for now as one movement affordance. The higher-impact work is:

- behavior selection after arrivals, task events, user interactions, and idle moments
- collision reactions that vary by pet personality or behavior components
- system ordering that clearly communicates which influence wins when multiple systems want to affect the same pet

## Current State

The project already moved away from a single `LocomotionState.baseMode` runtime model. Active movement is represented by tags such as:

- `WalkingState`
- `ClimbingState`
- `FlyingState`
- `AirborneState`

Jump is already modeled as an action through `JumpActionState`, not as a locomotion mode. This supports combinations like walk plus jump because walking can continue to own horizontal movement while jump applies a short-lived vertical impulse.

Climb also has a usable flow:

- `ClimbIntentState` approaches and attaches to a surface
- `ClimbingState` controls active climbing
- `ClimbDismountState` prevents immediate reattachment after leaving a surface

This is enough to pause deeper climb affordance work. The next meaningful improvement is the decision layer that makes pets choose and react believably.

## Product Priority

The living-pet feeling should come from two things:

1. What the pet chooses to do next.
2. How the pet reacts when something interrupts or touches it.

That makes these systems more important than further climb precision right now:

- Behavior selection
- User interaction response
- Agent event response
- Collision reaction
- Autonomous idle behavior
- Speech updates tied to behavior events

## Behavior Influence Priority

When more than one thing can affect a pet's next action, the priority is:

```text
user interaction > agent event > collision > autonomous behavior
```

This should be visible in the system pipeline, not hidden in scattered conditionals.

### Why System Interaction Instead Of A Behavior Influence Queue

The behavior priority can be represented with system interaction rather than a separate influence queue.

Each behavior system can directly write `IntentState`, `MotionTarget`, `NavigationState`, `JumpActionState`, `SpeechState`, or related components, but only if a higher-priority system has not already claimed the decision for that pet in the current decision window.

This keeps the ECS flow concrete:

- systems read components
- systems write components
- phase order explains priority
- a small decision claim component prevents lower-priority systems from overwriting higher-priority choices

## Claim And Skip Model

Use a `BehaviorDecisionState` component as the handshake between behavior systems.

```ts
export type BehaviorDecisionSource =
  | "user-interaction"
  | "agent-event"
  | "collision"
  | "autonomous";

export type BehaviorDecisionStateComponent = {
  type: "BehaviorDecisionState";
  source: BehaviorDecisionSource;
  decidedAt: number;
  expiresAt: number;
  reason: string;
};
```

Behavior systems run from highest priority to lowest priority:

```ts
BEHAVIOR_PHASE: [
  "UserInteractionBehaviorSystem",
  "AgentEventBehaviorSystem",
  "CollisionBehaviorSystem",
  "AutonomousBehaviorSystem",
]
```

Each system follows the same rule:

```ts
if (isClaimedByHigherPriority(decision, currentSource, now)) {
  return;
}

applyBehavior();
claimBehaviorDecision();
```

This is better than low-priority systems writing first and high-priority systems overwriting later because:

- the code reads in the same order as the product priority
- debug output can explain why a system skipped
- lower-priority systems do not leave stale `MotionTarget`, `NavigationState`, or speech side effects behind
- playground timelines can show the final behavior cause without transient overwritten decisions

## Behavior System Responsibilities

### UserInteractionBehaviorSystem

Highest-priority behavior source.

Examples:

- user clicks or calls a pet
- user drags a target
- user requests attention

Typical writes:

- `BehaviorDecisionState(source: "user-interaction")`
- `IntentState(intent: "seek")`
- `MotionTarget(targetEntityId: "user")`
- high-priority speech, if applicable

### AgentEventBehaviorSystem

Second-priority behavior source.

Examples:

- task started
- task waiting for approval
- task completed

Typical writes:

- `BehaviorDecisionState(source: "agent-event")`
- `IntentState(intent: "active" | "seek" | "idle")`
- `SpeechState`
- `ActivityState`

This system should not override an active user interaction decision.

### CollisionBehaviorSystem

Third-priority behavior source.

Collision reaction should become personality/component-driven. The current collision reaction is close to a target adjustment; the next version should express different reactions by component.

Examples:

- `AvoidsCrowds` -> creates a larger avoidance target
- `Bold` -> takes a smaller step away
- `Social` -> backs off slightly but tends to stay nearby
- `Nervous` -> escapes toward the user or a safer empty area
- `Playful` -> may request a jump after a bump

Typical writes:

- `BehaviorDecisionState(source: "collision")`
- `NavigationState(avoidanceWaypoint)`
- `MotionTarget(targetPosition)`
- optional `JumpActionState(phase: "requested")`
- collision speech with lower priority than user and agent speech

This system should not override user interaction or agent event decisions.

### AutonomousBehaviorSystem

Lowest-priority behavior source.

Examples:

- wander
- seek user
- climb nearby surface
- jump down
- idle speech
- avoid crowded place when there is no explicit collision event

This system fills silence. It should only run when no higher-priority behavior decision is active.

## Folder Structure Direction

Move away from broad layer buckets like `components/` and `systems/` as the primary mental model. Prefer feature folders that colocate the components and systems for a behavior area.

Recommended direction:

```text
src/
+-- ecs/
|   +-- component-store.ts
|   +-- component-registry.ts
|   +-- entity.ts
+-- world/
|   +-- create-world.ts
|   +-- scenario-fixtures.ts
|   +-- phases.ts
+-- features/
|   +-- movement/
|   |   +-- components.ts
|   |   +-- systems.ts
|   |   +-- systems/
|   +-- behavior/
|   |   +-- components.ts
|   |   +-- systems.ts
|   |   +-- systems/
|   +-- interaction/
|   |   +-- components.ts
|   |   +-- systems.ts
|   |   +-- systems/
|   +-- physics/
|   |   +-- components.ts
|   |   +-- systems.ts
|   |   +-- systems/
|   +-- speech/
|   |   +-- components.ts
|   |   +-- systems.ts
|   |   +-- systems/
|   +-- identity/
|       +-- components.ts
+-- playground/
```

### Movement Folder, Not Locomotion Plus Movement

Do not split `locomotion` and `movement` into separate feature folders yet.

The conceptual distinction is real:

- locomotion state answers "what movement mode owns control right now?"
- movement execution answers "what force or target update happens this frame?"

But as a feature folder split, that distinction is too fine for this project right now. It would make files harder to find.

Use one `features/movement` folder and separate the order through phases:

```ts
MOVEMENT_STATE: [
  "ClimbApproachSystem",
  "LocomotionModeSystem",
  "ClimbAttachmentSystem",
  "ClimbDismountSystem",
  "LocomotionActiveStateSystem",
],

MOVEMENT_FORCE: [
  "IntentSteeringSystem",
  "MotionTargetSystem",
  "WalkSystem",
  "JumpSystem",
  "WallClimbSystem",
  "FlightSystem",
],
```

## Phase Direction

The system pipeline should make priority and execution intent readable.

Recommended phase shape:

```ts
export const WORLD_PHASES = {
  BEHAVIOR: [
    "UserInteractionBehaviorSystem",
    "AgentEventBehaviorSystem",
    "CollisionBehaviorSystem",
    "AutonomousBehaviorSystem",
  ],
  MOVEMENT_STATE: [
    "ClimbApproachSystem",
    "LocomotionModeSystem",
    "ClimbAttachmentSystem",
    "ClimbDismountSystem",
    "LocomotionActiveStateSystem",
  ],
  MOVEMENT_FORCE: [
    "IntentSteeringSystem",
    "MotionTargetSystem",
    "WalkSystem",
    "JumpSystem",
    "WallClimbSystem",
    "FlightSystem",
  ],
  PHYSICS: [
    "PhysicsIntegrationSystem",
    "ContactSystem",
    "PhysicsTransformSyncSystem",
  ],
  POST_UPDATE: [
    "IdleConversationSystem",
  ],
};
```

The exact names can change during implementation, but the behavior order should remain:

```text
user interaction -> agent event -> collision -> autonomous
```

## Migration Strategy

Avoid a large one-shot move. Use a staged migration.

### Stage 1: Behavior And Interaction Foundation

- Add `features/behavior`
- Add `features/interaction`
- Add `BehaviorDecisionState`
- Add priority helpers for behavior claims
- Move or re-export `arrival-behavior-system` through the behavior feature
- Move or re-export `collision-reaction-system` through the interaction feature
- Add `world/phases.ts` or equivalent phase grouping

Keep existing imports working through compatibility exports where useful.

### Stage 2: Behavior Selection

- Add `AutonomousBehaviorSystem`
- Teach arrival/idle situations to choose a next behavior instead of only clearing targets
- Add deterministic tests for wander, seek-user, and idle choices
- Surface behavior decisions in the playground timeline

### Stage 3: Personality-Based Collision

- Add small personality or reaction components:
  - `AvoidsCrowds`
  - `Bold`
  - `Social`
  - `Nervous`
  - optional `Playful`
- Update collision reactions to use these components
- Ensure collision decisions skip when user or agent decisions are active

### Stage 4: Speech Priority

- Connect speech to behavior events:
  - idle
  - task started
  - task completed
  - arrival
  - collision
  - climb start
  - dismount
  - stuck
- Add priority so task and user-driven speech can outlive lower-priority idle/collision speech

### Stage 5: Broader Feature Folder Migration

- Move movement systems into `features/movement`
- Move physics systems into `features/physics`
- Move speech systems into `features/speech`
- Keep compatibility barrels until tests and imports have been gradually updated

## Recommended Next Implementation Slice

Start with the behavior claim model and collision integration.

Smallest useful slice:

1. Add `BehaviorDecisionState` and priority helper.
2. Add a behavior phase order that reads `user interaction -> agent event -> collision -> autonomous`.
3. Update collision reaction so it checks behavior claims before writing movement targets.
4. Add tests proving collision cannot override an active agent decision.
5. Add playground timeline output that shows behavior decision source and reason.

This creates the foundation for lively pets without prematurely expanding climb mechanics or doing a risky full-folder migration.
