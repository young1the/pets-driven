/**
 * Canonical 5-phase pipeline that defines which systems run in each stage and
 * in what order they are dispatched per simulation tick.
 *
 * Phase ordering contract:
 *  PRE_UPDATE  : sync external state (physics positions, contact detection)
 *  BEHAVIOR    : priority-ordered behavior decisions (claim/skip model)
 *  UPDATE      : locomotion state transitions and motion target resolution
 *  POST_UPDATE : force accumulation (walk, jump, flight, steering)
 *  SIMULATE    : physics integration and final position sync
 */

export type PhaseName = "PRE_UPDATE" | "BEHAVIOR" | "UPDATE" | "POST_UPDATE" | "SIMULATE";

export const SYSTEM_PHASES: Record<PhaseName, string[]> = {
  PRE_UPDATE: [
    "PhysicsTransformSyncSystem",
    "ContactSystem",
  ],

  BEHAVIOR: [
    "UserInteractionBehaviorSystem", // priority 1: user touch / pointer events
    "AgentEventBehaviorSystem",       // priority 2: external agent stimuli
    "CollisionBehaviorSystem",        // priority 3: entity overlap avoidance
    "AutonomousBehaviorSystem",       // priority 4: idle speech and wandering
  ],

  UPDATE: [
    "LocomotionModeSystem",
    "ClimbApproachSystem",
    "ArrivalBehaviorSystem",
    "ClimbDismountSystem",
    "LocomotionActiveStateSystem",
    "ClimbAttachmentSystem",
    "MotionTargetSystem",
  ],

  POST_UPDATE: [
    "WalkSystem",
    "JumpSystem",
    "WallClimbSystem",
    "IntentSteeringSystem",
    "FlightSystem",
  ],

  SIMULATE: [
    "PhysicsIntegrationSystem",
    "PhysicsTransformSyncSystem",
  ],
};

export const PHASE_ORDER: PhaseName[] = [
  "PRE_UPDATE",
  "BEHAVIOR",
  "UPDATE",
  "POST_UPDATE",
  "SIMULATE",
];

/** Flattened system name list in execution order, matching the pipeline above. */
export const SYSTEM_EXECUTION_ORDER: string[] = PHASE_ORDER.flatMap(
  (phase) => SYSTEM_PHASES[phase],
);
