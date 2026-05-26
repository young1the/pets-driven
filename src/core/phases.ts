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

import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import {
  UserInteractionBehaviorSystem,
  AgentEventBehaviorSystem,
  CollisionBehaviorSystem,
  BehaviorDecisionSystem,
  AutonomousBehaviorSystem,
  BehaviorPlanningSystem,
  ArrivalBehaviorSystem,
} from "@/features/behavior/systems";
import { ContactSystem } from "@/features/contact/systems";
import { PerceptionSystem } from "@/features/perception/systems";
import {
  LocomotionModeSystem,
  ClimbApproachSystem,
  ClimbDismountSystem,
  LocomotionActiveStateSystem,
  ClimbAttachmentSystem,
  MotionTargetSystem,
  WalkSystem,
  JumpSystem,
  WallClimbSystem,
  IntentSteeringSystem,
  FlightSystem,
} from "@/features/movement/systems";
import {
  PhysicsTransformSyncSystemPre,
  PhysicsTransformSyncSystemPost,
  PhysicsIntegrationSystem,
} from "@/features/physics/systems";

export type PhaseName = "PRE_UPDATE" | "BEHAVIOR" | "UPDATE" | "POST_UPDATE" | "SIMULATE";

export const SYSTEM_PHASES: Record<PhaseName, Array<SimulationSystem<WorldStepContext>>> = {
  PRE_UPDATE: [
    PhysicsTransformSyncSystemPre,
    ContactSystem,
    PerceptionSystem,
  ],

  BEHAVIOR: [
    UserInteractionBehaviorSystem, // priority 1: user touch / pointer events
    AgentEventBehaviorSystem,       // priority 2: external agent events
    CollisionBehaviorSystem,        // priority 3: entity overlap avoidance
    BehaviorDecisionSystem,         // priority 4a: personality-weighted next behavior (emits token)
    AutonomousBehaviorSystem,       // priority 4b: idle speech
    BehaviorPlanningSystem,         // materializes the decision token into concrete state
  ],

  UPDATE: [
    LocomotionModeSystem,
    ClimbApproachSystem,
    ArrivalBehaviorSystem,
    ClimbDismountSystem,
    LocomotionActiveStateSystem,
    ClimbAttachmentSystem,
    MotionTargetSystem,
  ],

  POST_UPDATE: [
    WalkSystem,
    JumpSystem,
    WallClimbSystem,
    IntentSteeringSystem,
    FlightSystem,
  ],

  SIMULATE: [
    PhysicsIntegrationSystem,
    PhysicsTransformSyncSystemPost,
  ],
};

export const PHASE_ORDER: PhaseName[] = [
  "PRE_UPDATE",
  "BEHAVIOR",
  "UPDATE",
  "POST_UPDATE",
  "SIMULATE",
];

/** Flattened per-tick pipeline in execution order. Single source of truth. */
export const STEP_SYSTEMS: Array<SimulationSystem<WorldStepContext>> = PHASE_ORDER.flatMap(
  (phase) => SYSTEM_PHASES[phase],
);
