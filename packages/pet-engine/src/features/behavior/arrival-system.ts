import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  adjustDrive,
  arrivalDwellMs,
  claim,
  clearMotionTarget,
} from "@pets-driven/pet-engine/features/behavior/claim";
import {
  ARRIVAL_DWELL_REASON,
  BOOKKEEPING_AUTONOMOUS_REASONS,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * ArrivalBehaviorSystem: decides when a pet has reached what it was walking
 * toward — a place, another pet, or the cursor — settles it there, and hands
 * the moment its arrival dwell so the decision loop does not immediately walk
 * it somewhere else.
 */

const APPROACH_PET_SUCCESS_RADIUS = 64;
const APPROACH_PET_TIMEOUT_MS = 4_000;
const APPROACH_PET_SUCCESS_CUE_MS = 1_000;

// Cursor play — laser-pointer-style chase.
const CHASE_CURSOR_SUCCESS_RADIUS = 48;
const CHASE_CURSOR_TIMEOUT_MS = 4_000;
const CHASE_CURSOR_SUCCESS_CUE_MS = 1_000;

const APPROACH_PET_SUCCESS_SOCIAL_REFILL = 0.5;

// A positional wander target the pet cannot make progress toward — jammed
// against a side wall or an interior monitor step (the hidden wall an L-shaped
// dual-monitor layout leaves at its height step) — is abandoned after this
// long with no improvement, so the pet returns to idle and re-decides instead
// of pushing into the wall forever. A shrink smaller than the epsilon counts as
// no progress, so slow-but-real walking keeps refreshing the timer while pure
// jitter against a wall does not.
const WANDER_STUCK_TIMEOUT_MS = 2_500;
const WANDER_PROGRESS_EPSILON = 2;

/**
 * A pet that just finished a movement earns a personality-length beat of
 * stillness before the decision loop may run again — back-to-back walks are
 * what read as aimless pacing. The dwell never steals the pet from any live
 * claim (social sessions, collisions, user holds all keep ownership); it only
 * fills the quiet gap after a completed, unclaimed movement.
 */
function applyArrivalDwell(
  components: ComponentStore,
  id: string,
  now: number,
  random: RandomSource | undefined,
): void {
  const personality = components.getComponent(id, "Personality");
  if (!personality) return;
  if (components.getComponent(id, "AgentTaskState")?.status === "working") return;
  // A live claim blocks the dwell — unless it is itself just bookkeeping
  // (idle-companion speech re-claims every ~1.5s and must not eat rest beats).
  const existing = components.getComponent(id, "BehaviorDecisionState");
  const blockedByLiveClaim =
    !!existing &&
    existing.expiresAt > now &&
    !(existing.source === "autonomous" && BOOKKEEPING_AUTONOMOUS_REASONS.has(existing.reason));
  if (blockedByLiveClaim) {
    return;
  }
  claim(
    components,
    id,
    "autonomous",
    now,
    ARRIVAL_DWELL_REASON,
    now + arrivalDwellMs(personality, random),
  );
}

// Arrival detection (runs in UPDATE phase, after locomotion decisions).
// Not a BEHAVIOR-phase system: it detects arrival at any target regardless of
// which source directed the pet there.
export function runArrivalBehaviorSystem(
  components: ComponentStore,
  clock?: Clock,
  random?: RandomSource,
): void {
  components.forEach(
    ["Steering", "Transform", "MotionTarget", "WandersOnArrival"],
    (id, [intent, transform, motion, wandersOnArrival]) => {
      if (motion.targetEntityId) {
        const decision = components.getComponent(id, "BehaviorDecisionState");
        const decisionToken = components.getComponent(id, "BehaviorDecisionToken");
        const isApproachingPet =
          intent.mode === "pursue" &&
          (decisionToken?.kind === "approach-pet" || decision?.reason === "approach-pet");

        if (isApproachingPet) {
          const startedAt =
            decisionToken?.kind === "approach-pet"
              ? decisionToken.decidedAt
              : (decision?.decidedAt ?? 0);
          const now = clock?.now() ?? startedAt;
          const perception = components.getComponent(id, "Perception");
          const targetPet = perception?.nearbyPets.find((pet) => pet.id === motion.targetEntityId);
          const targetPosition = targetPet?.position ?? motion.targetPosition;
          if (targetPosition) {
            const dx = targetPosition.x - transform.position.x;
            const dy = targetPosition.y - transform.position.y;
            const isFlying = !!components.getComponent(id, "FlyingTag");
            const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
            if (dist <= APPROACH_PET_SUCCESS_RADIUS) {
              motion.targetEntityId = null;
              motion.targetPosition = null;
              intent.mode = "stand";
              components.setComponent(id, {
                type: "BehaviorDecisionState",
                source: "autonomous",
                decidedAt: now,
                expiresAt: now + APPROACH_PET_SUCCESS_CUE_MS,
                reason: "approach-pet-success",
                lastAutonomousReason: decision?.lastAutonomousReason ?? "approach-pet",
                lastAutonomousAt: decision?.lastAutonomousAt ?? startedAt,
              });
              components.removeComponent(id, "BehaviorDecisionToken");
              // Catching another pet is a substantial social win.
              adjustDrive(components, id, {
                social: -APPROACH_PET_SUCCESS_SOCIAL_REFILL,
              });
              return;
            }
          }

          if (now - startedAt > APPROACH_PET_TIMEOUT_MS) {
            motion.targetEntityId = null;
            motion.targetPosition = null;
            intent.mode = "stand";
            if (decision) decision.expiresAt = now;
            components.removeComponent(id, "BehaviorDecisionToken");
            return;
          }

          return;
        }

        const isChasingCursor =
          intent.mode === "pursue" &&
          (decisionToken?.kind === "chase-cursor" || decision?.reason === "chase-cursor");

        if (isChasingCursor) {
          const startedAt =
            decisionToken?.kind === "chase-cursor"
              ? decisionToken.decidedAt
              : (decision?.decidedAt ?? 0);
          const now = clock?.now() ?? startedAt;
          const perception = components.getComponent(id, "Perception");
          const anchor = perception?.userAnchor;
          const targetPosition =
            anchor && anchor.id === motion.targetEntityId ? anchor.position : motion.targetPosition;
          if (targetPosition) {
            const dx = targetPosition.x - transform.position.x;
            const dy = targetPosition.y - transform.position.y;
            const isFlying = !!components.getComponent(id, "FlyingTag");
            const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
            if (dist <= CHASE_CURSOR_SUCCESS_RADIUS) {
              motion.targetEntityId = null;
              motion.targetPosition = null;
              intent.mode = "stand";
              components.setComponent(id, {
                type: "BehaviorDecisionState",
                source: "autonomous",
                decidedAt: now,
                expiresAt: now + CHASE_CURSOR_SUCCESS_CUE_MS,
                reason: "chase-cursor-success",
                lastAutonomousReason: decision?.lastAutonomousReason ?? "chase-cursor",
                lastAutonomousAt: decision?.lastAutonomousAt ?? startedAt,
              });
              components.setComponent(id, {
                type: "PetExpressionState",
                source: "chase-cursor",
                mood: "excited",
                emote: "sparkle",
                label: null,
                startedAt: now,
                expiresAt: now + CHASE_CURSOR_SUCCESS_CUE_MS,
              });
              components.removeComponent(id, "BehaviorDecisionToken");
              return;
            }
          }

          if (now - startedAt > CHASE_CURSOR_TIMEOUT_MS) {
            motion.targetEntityId = null;
            motion.targetPosition = null;
            intent.mode = "stand";
            if (decision) decision.expiresAt = now;
            components.removeComponent(id, "BehaviorDecisionToken");
            return;
          }

          return;
        }

        if (intent.mode !== "arrive") return;
        const perception = components.getComponent(id, "Perception");
        const anchor = perception?.userAnchor;
        if (!anchor) return;
        // MotionTargetSystem may set a concrete stop-short position for entity
        // targets such as user-anchor. Arrival must compare against that resolved
        // position, not the entity center, otherwise walkers stop at their target
        // while the entity target remains permanently active.
        const arrivalTarget = motion.targetPosition ?? anchor.position;
        // Flying pets can close the gap in both axes; walking pets are locked to
        // the ground and can only reduce horizontal distance — use |dx| so arrival
        // fires as soon as the walk system stops (they share the same threshold).
        const dx = arrivalTarget.x - transform.position.x;
        const dy = arrivalTarget.y - transform.position.y;
        const isFlying = !!components.getComponent(id, "FlyingTag");
        const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
        if (dist > wandersOnArrival.arrivalRadius) return;
        intent.mode = "stand";
        motion.targetEntityId = null;
        motion.targetPosition = null;
        if (clock) applyArrivalDwell(components, id, clock.now(), random);
        return;
      }

      const target = motion.targetPosition;
      if (!target) return;

      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (climbIntent?.phase === "approaching") return;

      const climbing = components.getComponent(id, "ClimbingTag");
      const delta = climbing
        ? Math.abs(target.y - transform.position.y)
        : Math.abs(target.x - transform.position.x);

      if (delta > wandersOnArrival.arrivalRadius) {
        // No-progress watchdog (grounded pets only; climbing has its own phase
        // handling). A walker wedged against an interior monitor step can never
        // shrink `delta`, so without this it would hold this target forever.
        if (clock && !climbing) {
          const now = clock.now();
          if (
            motion.progressBest === undefined ||
            delta < motion.progressBest - WANDER_PROGRESS_EPSILON
          ) {
            motion.progressBest = delta;
            motion.progressAt = now;
          } else if (
            motion.progressAt !== undefined &&
            now - motion.progressAt > WANDER_STUCK_TIMEOUT_MS
          ) {
            // Stuck: drop the unreachable target and re-decide next tick. No
            // arrival dwell — this is a give-up, not a real arrival, so the pet
            // should immediately pick a fresh (reachable) target.
            clearMotionTarget(components, id);
            intent.mode = "stand";
          }
        }
        return;
      }
      motion.targetEntityId = null;
      motion.targetPosition = null;
      intent.mode = "stand";
      if (clock) applyArrivalDwell(components, id, clock.now(), random);
    },
  );
}
