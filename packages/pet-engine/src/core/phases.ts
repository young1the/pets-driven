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
  AgentTaskEventSystem,
  ArrivalBehaviorSystem,
  AutonomousBehaviorSystem,
  BehaviorDecisionSystem,
  BehaviorPlanningSystem,
  CollisionBehaviorSystem,
  FeintProgressSystem,
  HoverReactionSystem,
  PersonalSpaceSystem,
  PetExpressionExpirationSystem,
  PettingDetectionSystem,
  QuietChatterSystem,
  QuietStillnessSystem,
  RompProgressSystem,
  SpeechExpirationSystem,
  TaskMovementHoldSystem,
} from "@pets-driven/pet-engine/features/behavior/behavior-systems";
import { ContactSystem } from "@pets-driven/pet-engine/features/contact/systems";
import { CursorInputSystem } from "@pets-driven/pet-engine/features/cursor/systems";
import { DriveDecaySystem } from "@pets-driven/pet-engine/features/drives/systems";
import {
  DraggedEntityKinematicSystem,
  KeyboardControlMovementSystem,
  ThrowImpulseSystem,
  UserInteractionBehaviorSystem,
} from "@pets-driven/pet-engine/features/interaction/systems";
import {
  ItemAbilityExpirySystem,
  ItemPickupSystem,
  ItemSpawnSystem,
} from "@pets-driven/pet-engine/features/items/systems";
import { MoodRecoverySystem } from "@pets-driven/pet-engine/features/mood/systems";
import {
  ClimbApproachSystem,
  ClimbAttachmentSystem,
  ClimbDismountSystem,
  FlightSystem,
  JumpSystem,
  LocomotionActiveStateSystem,
  LocomotionModeSystem,
  MotionTargetSystem,
  SteeringForceSystem,
  TravelTrackingSystem,
  WalkSystem,
  WallClimbSystem,
} from "@pets-driven/pet-engine/features/movement/systems";
import { PerceptionSystem } from "@pets-driven/pet-engine/features/perception/systems";
import {
  AirborneSlipSystem,
  PetCollisionSyncSystem,
  PhysicsIntegrationSystem,
  PhysicsTransformSyncSystemPost,
  PhysicsTransformSyncSystemPre,
} from "@pets-driven/pet-engine/features/physics/systems";
import { PropKickSystem } from "@pets-driven/pet-engine/features/props/systems";
import { SignatureReactionSystem } from "@pets-driven/pet-engine/features/social/signature-reactions";
import { SocialInteractionSystem } from "@pets-driven/pet-engine/features/social/social-systems";

export type PhaseName = "PRE_UPDATE" | "BEHAVIOR" | "UPDATE" | "POST_UPDATE" | "SIMULATE";

export const SYSTEM_PHASES: Record<PhaseName, Array<SimulationSystem<WorldStepContext>>> = {
  PRE_UPDATE: [
    PhysicsTransformSyncSystemPre,
    PetCollisionSyncSystem,
    ContactSystem,
    // Trinkets settle before Perception looks for them, and a collected one is
    // gone from the store in the same tick it was taken — so no pet can be
    // offered an item another pet already picked up this frame.
    ItemSpawnSystem,
    ItemPickupSystem,
    ItemAbilityExpirySystem,
    CursorInputSystem, // ingest live cursor samples before Perception reads them
    PerceptionSystem,
  ],

  BEHAVIOR: [
    UserInteractionBehaviorSystem, // priority 1: user touch / pointer events
    PettingDetectionSystem, // priority 1: cursor-oscillation petting reaction
    HoverReactionSystem, // priority 1: cursor over a moving pet → stop + personality reaction
    SpeechExpirationSystem, // clear expired speech before new decisions
    PetExpressionExpirationSystem,
    AgentTaskEventSystem, // priority 2: external agent events → task state
    CollisionBehaviorSystem, // priority 3: overlap startle → reaction/bump-to-greet
    // Same tier and the same idea: a physical overlap the pet did not deliberate
    // over. Sits after the pet-to-pet reaction so a startle still wins the claim,
    // and before the decision systems so the drive and mood a kick just changed
    // are the ones this tick's decision is made on.
    PropKickSystem, // priority 3: pet walks into a prop → kick
    SocialInteractionSystem, // priority 4 (social): pet-to-pet greet/chat/chase sessions
    BehaviorDecisionSystem, // priority 5 (autonomous): personality-weighted next behavior (emits token)
    SignatureReactionSystem, // social echo: nearby pets answer fresh personality signatures
    AutonomousBehaviorSystem, // priority 4b: idle speech
    BehaviorPlanningSystem, // materializes the decision token into concrete state
    FeintProgressSystem, // mischievous approach-then-retreat signature activity
    RompProgressSystem, // advances live play-romp activities (hop/dash choreography)
    PersonalSpaceSystem, // idle stacked pets take a cosmetic step aside
    // Last, so it sweeps every line this phase could have produced before the
    // host ever sees one (Quiet Mode; agent status is never swept).
    QuietChatterSystem,
  ],

  UPDATE: [
    LocomotionModeSystem,
    ClimbApproachSystem,
    ArrivalBehaviorSystem,
    ClimbDismountSystem,
    LocomotionActiveStateSystem,
    ClimbAttachmentSystem,
    MotionTargetSystem,
    DriveDecaySystem, // passive drive drift; reads this tick's Steering
    MoodRecoverySystem, // recent experiences fade back toward personality baseline
  ],

  POST_UPDATE: [
    // Runs before the force systems so a held pet's motion target is cleared
    // before WalkSystem/SteeringForceSystem can turn it into movement.
    TaskMovementHoldSystem,
    // Same slot, same reason: park the pets Quiet Mode is holding still before
    // the force systems can act on the errand they were already on.
    QuietStillnessSystem,
    WalkSystem,
    JumpSystem,
    WallClimbSystem,
    SteeringForceSystem,
    KeyboardControlMovementSystem,
    FlightSystem,
    DraggedEntityKinematicSystem,
    ThrowImpulseSystem,
  ],

  SIMULATE: [
    // Sets each pet's surface friction from its grounded state before the
    // integration step reads it (thrown pets slide down walls; grounded pets
    // keep their grip).
    AirborneSlipSystem,
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
export const STEP_SYSTEMS: Array<SimulationSystem<WorldStepContext>> = PHASE_ORDER.flatMap(
  (phase) => SYSTEM_PHASES[phase],
);
