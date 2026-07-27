import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { decideAutonomousBehavior } from "@pets-driven/pet-engine/features/behavior/autonomous-decision";
import type { DecisionContext } from "@pets-driven/pet-engine/features/behavior/decision-candidates";
import { decidePendingReaction } from "@pets-driven/pet-engine/features/behavior/reaction-decision";
import { decideWorkingBehavior } from "@pets-driven/pet-engine/features/behavior/working-decision";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

// ── BehaviorDecisionSystem (priority 4: autonomous) ──────────────────────
//
// Trigger: no active claim AND intent === "idle" AND no motion target.
// Scores all candidates using OCEAN Personality weights, then samples a winner
// via softmax (temperature scales with neuroticism: high N → flatter distribution).
// Emits a BehaviorDecisionToken and claims the entity with source="autonomous".
// Does NOT mutate MotionTarget / Steering / JumpActionState / ClimbIntentState —
// that is the responsibility of BehaviorPlanningSystem.
//
// Which pool a pet draws from is decided here and nowhere else, in priority
// order: a due collision reaction, then work, then ordinary autonomous life.
// Each pool lives in its own file and owns the token and claim it writes.

export function runBehaviorDecisionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  // One pet per climbable surface at a time.  Pre-populate from entities that
  // are already approaching or actively climbing.  Updated on winner selection so
  // sequential entity passes in the same step also see fresh reservations.
  const claimedSurfaces = new Set<string>();
  components.forEach(["ClimbIntentState"], (otherId, [otherIntent]) => {
    if (otherIntent.phase === "approaching") {
      claimedSurfaces.add(otherIntent.surfaceEntityId);
      return;
    }
    if (otherIntent.phase === "attached" && components.getComponent(otherId, "ClimbingTag")) {
      claimedSurfaces.add(otherIntent.surfaceEntityId);
    }
  });

  components.forEach(
    ["Steering", "MotionTarget", "Transform", "Personality"],
    (id, [intent, motion, transform, personality]) => {
      // Trigger conditions — only fire for pets that have no active goal.
      // "active" = pursuing a wander/climb target  "seek" = pursuing user
      // Both set a motion target; arrival resets intent back to "idle".
      // "idle" is the only state that means "ready for a new decision".
      if (intent.mode !== "stand") return;
      if (motion.targetPosition !== null) return;
      if (motion.targetEntityId !== null) return;

      // Block if any active claim exists (same- and higher-priority guard).
      const existingClaim = components.getComponent(id, "BehaviorDecisionState");
      if (existingClaim && existingClaim.expiresAt > now) return;

      // Skip only while the pet is actually held (a freezing task the user
      // has not released). A released pet keeps its reported status but is
      // free to make autonomous decisions again.
      if (components.getComponent(id, "TaskMovementHold")) return;

      // If the pet is already committed to approaching a climb surface, don't
      // emit a new autonomous decision — that would change intent and allow
      // MotionTargetSystem (seek) to overwrite ClimbApproachSystem's target.
      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (climbIntent?.phase === "approaching") return;

      const context: DecisionContext = {
        components,
        id,
        now,
        random,
        bounds,
        personality,
        petX: transform.position.x,
        petY: transform.position.y,
        // Optional — undefined for pets built before this feature. Every
        // drives-aware score function falls back to its original
        // personality-only formula when this is undefined.
        drives: components.getComponent(id, "Drives"),
        mood: components.getComponent(id, "MoodState"),
      };

      // Phase 4: PendingReaction present → claim just expired at reactsAt.
      // Route to the personality-shaped reactive candidate pool instead of
      // the normal autonomous pool.
      const pendingReaction = components.getComponent(id, "PendingReaction");
      if (pendingReaction && decidePendingReaction(context, pendingReaction)) return;

      const agentTask = components.getComponent(id, "AgentTaskState");
      if (agentTask?.status === "working" && decideWorkingBehavior(context)) return;

      decideAutonomousBehavior(context, claimedSurfaces);
    },
  );
}
