import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import { runSocialInteractionSystem } from "./systems";

// ── System descriptor ────────────────────────────────────────────────────────
// Thin SimulationSystem wrapper over runSocialInteractionSystem: declares the
// system's dependency order and its read/write component sets, then delegates
// to the plain function. Registered in the phase pipeline (core/phases.ts).

export const SocialInteractionSystem: SimulationSystem<WorldStepContext> = {
  name: "SocialInteractionSystem",
  dependsOn: ["WorkingBehaviorSystem"],
  reads: [
    "CanSocialize",
    "Personality",
    "Drives",
    "Steering",
    "MotionTarget",
    "Transform",
    "ContactState",
    "PhysicsBody",
    "AgentTaskState",
    "BehaviorDecisionState",
    "TaskMovementHold",
    "SocialInvite",
    "SocialSession",
    "SocialSessionMember",
    "PendingReaction",
    "MoodState",
    "RecentExperienceMemory",
  ],
  writes: [
    "SocialInvite",
    "SocialSession",
    "SocialSessionMember",
    "BehaviorDecisionState",
    "MotionTarget",
    "Steering",
    "PetExpressionState",
    "AgentChannelState",
    "Drives",
    "PendingReaction",
    "MoodState",
    "RecentExperienceMemory",
  ],
  update(ctx) {
    runSocialInteractionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds, ctx.deltaMs);
  },
};
