import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  runAgentChannelMessageExpirationSystem,
  runPetExpressionExpirationSystem,
} from "@pets-driven/pet-engine/features/behavior/expiration-systems";
import {
  runAgentTaskEventSystem,
  runArrivalBehaviorSystem,
  runAutonomousBehaviorSystem,
  runBehaviorDecisionSystem,
  runBehaviorPlanningSystem,
  runCollisionBehaviorSystem,
  runFeintProgressSystem,
  runHoverReactionSystem,
  runPersonalSpaceSystem,
  runPettingDetectionSystem,
  runRompProgressSystem,
  runTaskMovementHoldSystem,
} from "./systems";

// ── System descriptors ─────────────────────────────────────────────────────
// Thin SimulationSystem wrappers over the run* behavior functions in
// ./systems: they declare each system's name, dependency order, and its
// read/write component sets, then delegate to the plain function. The phase
// pipeline (core/phases.ts) is the single source of truth for run order.

export const SpeechExpirationSystem: SimulationSystem<WorldStepContext> = {
  name: "SpeechExpirationSystem",
  dependsOn: ["UserInteractionBehaviorSystem"],
  reads: ["AgentChannelState"],
  writes: ["AgentChannelState"],
  update(ctx) {
    runAgentChannelMessageExpirationSystem(ctx.components, ctx.clock);
  },
};

export const PetExpressionExpirationSystem: SimulationSystem<WorldStepContext> = {
  name: "PetExpressionExpirationSystem",
  dependsOn: ["SpeechExpirationSystem"],
  reads: ["PetExpressionState"],
  writes: ["PetExpressionState"],
  update(ctx) {
    runPetExpressionExpirationSystem(ctx.components, ctx.clock);
  },
};

export const PettingDetectionSystem: SimulationSystem<WorldStepContext> = {
  name: "PettingDetectionSystem",
  dependsOn: ["UserInteractionBehaviorSystem"],
  reads: [
    "CursorState",
    "Transform",
    "PhysicsBody",
    "PetIdentity",
    "Personality",
    "DragInteraction",
    "BehaviorDecisionState",
    "PetExpressionState",
    "AgentTaskState",
    "AgentChannelState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "BehaviorDecisionState",
    "PetExpressionState",
    "Steering",
    "MotionTarget",
    "PhysicsVelocity",
    "TaskMovementHold",
    "AgentTaskState",
    "AgentChannelState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runPettingDetectionSystem(ctx.components, ctx.clock, ctx.physics, ctx.random);
  },
};

// Runs after PettingDetectionSystem so a live petting claim wins over the
// plain hover reaction (both claim at user-interaction priority).
export const HoverReactionSystem: SimulationSystem<WorldStepContext> = {
  name: "HoverReactionSystem",
  dependsOn: ["PettingDetectionSystem"],
  reads: [
    "CursorState",
    "Transform",
    "PhysicsBody",
    "PetIdentity",
    "Personality",
    "Steering",
    "TaskMovementHold",
    "DragInteraction",
    "BehaviorDecisionState",
  ],
  writes: [
    "BehaviorDecisionState",
    "PetExpressionState",
    "Steering",
    "MotionTarget",
    "PhysicsVelocity",
  ],
  update(ctx) {
    runHoverReactionSystem(ctx.components, ctx.clock, ctx.physics);
  },
};

export const AgentTaskEventSystem: SimulationSystem<WorldStepContext> = {
  name: "AgentTaskEventSystem",
  dependsOn: ["PetExpressionExpirationSystem"],
  reads: ["AgentBinding", "SpeechProfile", "ActivityState", "MoodState", "RecentExperienceMemory"],
  writes: [
    "AgentTaskState",
    "AgentActivitySignal",
    "AgentChannelState",
    "ActivityState",
    "BehaviorDecisionState",
    "TaskMovementHold",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runAgentTaskEventSystem(
      ctx.components,
      ctx.events.drainWhere((event) => event.kind === "agent"),
      ctx.clock,
      ctx.random,
    );
  },
};

export const TaskMovementHoldSystem: SimulationSystem<WorldStepContext> = {
  name: "TaskMovementHoldSystem",
  dependsOn: ["MotionTargetSystem"],
  reads: ["TaskMovementHold"],
  writes: ["MotionTarget", "PhysicsVelocity"],
  update(ctx) {
    runTaskMovementHoldSystem(ctx.components, ctx.physics);
  },
};

export const CollisionBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "CollisionBehaviorSystem",
  dependsOn: ["AgentTaskEventSystem"],
  reads: [
    "Transform",
    "PhysicsBody",
    "Steering",
    "MotionTarget",
    "Personality",
    "BehaviorDecisionState",
    "PendingReaction",
    "PetCollision",
    "AgentTaskState",
    "ClimbingTag",
    "AirborneTag",
    "ClimbIntentState",
    "SocialSessionMember",
    "CollisionMemory",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "PendingReaction",
    "BehaviorDecisionState",
    "MotionTarget",
    "Steering",
    "PetExpressionState",
    "CollisionMemory",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runCollisionBehaviorSystem(ctx.components, ctx.bounds, ctx.clock);
  },
};

export const BehaviorDecisionSystem: SimulationSystem<WorldStepContext> = {
  name: "BehaviorDecisionSystem",
  dependsOn: ["CollisionBehaviorSystem"],
  reads: [
    "Steering",
    "MotionTarget",
    "Transform",
    "Personality",
    "BehaviorDecisionState",
    "AgentTaskState",
    "ClimbIntentState",
    "ClimbingTag",
    "Perception",
    "PendingReaction",
    "FlyingTag",
    "WalkingTag",
    "CanJump",
    "JumpActionState",
    "ContactState",
    "CanWallClimb",
    "ClimbDismountState",
    "Drives",
    "MoodState",
    "TaskMovementHold",
    "AgentActivitySignal",
    // B4: bump-to-greet eligibility (drops collision-engage for social pairs).
    "CanSocialize",
    "SocialSessionMember",
  ],
  writes: ["BehaviorDecisionToken", "BehaviorDecisionState", "PendingReaction"],
  update(ctx) {
    runBehaviorDecisionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const BehaviorPlanningSystem: SimulationSystem<WorldStepContext> = {
  name: "BehaviorPlanningSystem",
  dependsOn: ["AutonomousBehaviorSystem"],
  reads: ["BehaviorDecisionToken", "JumpActionState", "MoodState", "RecentExperienceMemory"],
  writes: [
    "Steering",
    "MotionTarget",
    "JumpActionState",
    "ClimbIntentState",
    "BehaviorDecisionToken",
    "Drives",
    "PetExpressionState",
    "FeintState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runBehaviorPlanningSystem(ctx.components, ctx.clock);
  },
};

export const AutonomousBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "AutonomousBehaviorSystem",
  dependsOn: ["BehaviorDecisionSystem"],
  reads: ["IdleConversation", "SpeechProfile", "AgentChannelState", "ActivityState"],
  writes: ["AgentChannelState", "BehaviorDecisionState"],
  update(ctx) {
    runAutonomousBehaviorSystem(ctx.components, ctx.clock, ctx.random);
  },
};

export const ArrivalBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "ArrivalBehaviorSystem",
  dependsOn: ["ClimbApproachSystem"],
  reads: [
    "Transform",
    "MotionTarget",
    "WandersOnArrival",
    "Steering",
    "ClimbingTag",
    "Perception",
    "ClimbIntentState",
    "Personality",
    "BehaviorDecisionState",
  ],
  writes: ["MotionTarget", "Steering", "PetExpressionState", "Drives", "BehaviorDecisionState"],
  update(ctx) {
    runArrivalBehaviorSystem(ctx.components, ctx.clock, ctx.random);
  },
};

export const PersonalSpaceSystem: SimulationSystem<WorldStepContext> = {
  name: "PersonalSpaceSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "PetCollision",
    "Steering",
    "MotionTarget",
    "Transform",
    "PetIdentity",
    "WalkingTag",
    "FlyingTag",
    "ClimbingTag",
    "ContactState",
    "PendingReaction",
    "BehaviorDecisionState",
    "PhysicsBody",
  ],
  writes: ["MotionTarget", "Steering", "BehaviorDecisionState"],
  update(ctx) {
    runPersonalSpaceSystem(ctx.components, ctx.clock, ctx.bounds);
  },
};

export const RompProgressSystem: SimulationSystem<WorldStepContext> = {
  name: "RompProgressSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "RompState",
    "Transform",
    "BehaviorDecisionState",
    "ContactState",
    "JumpActionState",
    "PhysicsBody",
    "Drives",
  ],
  writes: [
    "RompState",
    "MotionTarget",
    "Steering",
    "JumpActionState",
    "PetExpressionState",
    "BehaviorDecisionState",
    "Drives",
  ],
  update(ctx) {
    runRompProgressSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const FeintProgressSystem: SimulationSystem<WorldStepContext> = {
  name: "FeintProgressSystem",
  dependsOn: ["BehaviorPlanningSystem"],
  reads: [
    "FeintState",
    "Transform",
    "PhysicsBody",
    "BehaviorDecisionState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "FeintState",
    "MotionTarget",
    "Steering",
    "PetExpressionState",
    "BehaviorDecisionState",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runFeintProgressSystem(ctx.components, ctx.clock, ctx.bounds);
  },
};
