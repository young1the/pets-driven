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

import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  DraggedEntityKinematicSystem,
  KeyboardControlMovementSystem,
  ThrowImpulseSystem,
  UserInteractionBehaviorSystem,
} from "@pets-driven/pet-engine/features/interaction/systems";
import {
  SpeechExpirationSystem,
  PetExpressionExpirationSystem,
  AgentTaskEventSystem,
  TaskMovementHoldSystem,
  CollisionBehaviorSystem,
  WorkingBehaviorSystem,
  BehaviorDecisionSystem,
  AutonomousBehaviorSystem,
  BehaviorPlanningSystem,
  RompProgressSystem,
  PersonalSpaceSystem,
  ArrivalBehaviorSystem,
  PettingDetectionSystem,
} from "@pets-driven/pet-engine/features/behavior/systems";
import { ContactSystem } from "@pets-driven/pet-engine/features/contact/systems";
import { CursorInputSystem } from "@pets-driven/pet-engine/features/cursor/systems";
import { SocialInteractionSystem } from "@pets-driven/pet-engine/features/social/systems";
import { PerceptionSystem } from "@pets-driven/pet-engine/features/perception/systems";
import { DriveDecaySystem } from "@pets-driven/pet-engine/features/drives/systems";
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
  TravelTrackingSystem,
} from "@pets-driven/pet-engine/features/movement/systems";
import {
  PhysicsTransformSyncSystemPre,
  PetCollisionSyncSystem,
  PhysicsTransformSyncSystemPost,
  PhysicsIntegrationSystem,
} from "@pets-driven/pet-engine/features/physics/systems";

export type PhaseName =
  "PRE_UPDATE" | "BEHAVIOR" | "UPDATE" | "POST_UPDATE" | "SIMULATE";

export const SYSTEM_PHASES: Record<
  PhaseName,
  Array<SimulationSystem<WorldStepContext>>
> = {
  PRE_UPDATE: [
    PhysicsTransformSyncSystemPre,
    PetCollisionSyncSystem,
    ContactSystem,
    CursorInputSystem, // ingest live cursor samples before Perception reads them
    PerceptionSystem,
  ],

  BEHAVIOR: [
    UserInteractionBehaviorSystem, // priority 1: user touch / pointer events
    PettingDetectionSystem, // priority 1: cursor-oscillation petting reaction
    SpeechExpirationSystem, // clear expired speech before new decisions
    PetExpressionExpirationSystem,
    AgentTaskEventSystem, // priority 2: external agent events → task state
    CollisionBehaviorSystem, // priority 3: overlap startle → reaction/bump-to-greet
    WorkingBehaviorSystem, // priority 4a: working-state focus or wandering
    SocialInteractionSystem, // priority 4 (social): pet-to-pet greet/chat/chase sessions
    BehaviorDecisionSystem, // priority 5 (autonomous): personality-weighted next behavior (emits token)
    AutonomousBehaviorSystem, // priority 4b: idle speech
    BehaviorPlanningSystem, // materializes the decision token into concrete state
    RompProgressSystem, // advances live play-romp activities (hop/dash choreography)
    PersonalSpaceSystem, // idle stacked pets take a cosmetic step aside
  ],

  UPDATE: [
    LocomotionModeSystem,
    ClimbApproachSystem,
    ArrivalBehaviorSystem,
    ClimbDismountSystem,
    LocomotionActiveStateSystem,
    ClimbAttachmentSystem,
    MotionTargetSystem,
    DriveDecaySystem, // passive drive drift; reads this tick's IntentState
  ],

  POST_UPDATE: [
    // Runs before the force systems so a held pet's motion target is cleared
    // before WalkSystem/IntentSteeringSystem can turn it into movement.
    TaskMovementHoldSystem,
    WalkSystem,
    JumpSystem,
    WallClimbSystem,
    IntentSteeringSystem,
    KeyboardControlMovementSystem,
    FlightSystem,
    DraggedEntityKinematicSystem,
    ThrowImpulseSystem,
  ],

  SIMULATE: [
    PhysicsIntegrationSystem,
    PhysicsTransformSyncSystemPost,
    // Derives per-tick travel displacement from the freshly synced Transform,
    // so the animation layer reads movement from engine state, not physics.
    TravelTrackingSystem,
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
export const STEP_SYSTEMS: Array<SimulationSystem<WorldStepContext>> =
  PHASE_ORDER.flatMap((phase) => SYSTEM_PHASES[phase]);
