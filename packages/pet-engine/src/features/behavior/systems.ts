import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  EXPRESSIVE_POSE_CUES,
  EXPRESSIVE_POSE_DURATIONS,
  expressivePoseDurationMs,
  FEINT_APPROACH_MS,
  FEINT_BASE_MS,
  FEINT_EXTRA_MS,
  JUMP_ENERGY_COST,
  ROMP_BASE_MS,
  ROMP_END_CUE_MS,
  ROMP_EXTRA_MS,
  STRUT_BODY_WIDTHS,
  STRUT_DURATION_MS,
  STRUT_SPEED_FACTOR,
  WITHDRAW_BODY_WIDTHS,
  WITHDRAW_DURATION_MS,
} from "@pets-driven/pet-engine/features/behavior/activity-tuning";
import {
  adjustDrive,
  arrivalDwellMs,
  claim,
  clearMotionTarget,
  isClaimed,
  isClaimedBySameOrHigherPriority,
  setPetSteering,
} from "@pets-driven/pet-engine/features/behavior/claim";
import {
  type Candidate,
  isNearUserAnchor,
  pickWanderPosition,
  pushCandidate,
} from "@pets-driven/pet-engine/features/behavior/decision-candidates";
import {
  COLLISION_TARGET_MARGIN,
  clamp,
  clampToBoundsX,
  clampToBoundsY,
  DEFAULT_BEHAVIOR_BODY_WIDTH,
  fallbackHorizontalDirection,
  normalize,
  petWidth,
} from "@pets-driven/pet-engine/features/behavior/geometry";
import {
  moodAdjustedDecisionScore,
  recordPetExperience,
} from "@pets-driven/pet-engine/features/mood/systems";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
import { isBumpSocialEligible } from "@pets-driven/pet-engine/features/social/systems";
import {
  personalityIdleDurationScale,
  signedDecisionScore,
} from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import {
  TOOL_ACTIVITY_FRESHNESS_MS,
  workingBehaviorHoldMs,
  workingStyle,
} from "@pets-driven/pet-engine/pets/personalities/working-styles";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import {
  ARRIVAL_DWELL_REASON,
  type BehaviorDecisionSelectionTrace,
  BOOKKEEPING_AUTONOMOUS_REASONS,
  type PendingReactionComponent,
  type PersonalityComponent,
  type PetExpressionEmote,
  type PetExpressionMood,
  type ReactionSource,
} from "./components";
import {
  SECOND_SIGNATURE_POSE,
  scoreApproachPet,
  scoreBeckon,
  scoreChaseCursor,
  scoreClimb,
  scoreFleeFromPet,
  scoreFollowRoutine,
  scoreFret,
  scoreGreet,
  scoreGroom,
  scoreIdleStay,
  scoreInspect,
  scoreJump,
  scoreKeepWatch,
  scoreMeditate,
  scoreNap,
  scoreObserve,
  scoreOfferComfort,
  scorePeek,
  scorePlayFeint,
  scorePlayRomp,
  scoreSeekUser,
  scoreStandLookout,
  scoreStrut,
  scoreWanderFar,
  scoreWanderNear,
  scoreWithdraw,
} from "./decision-scores";

const COLLISION_REACTION_WIDTH_MULTIPLIER = 6;
const _USER_PROXIMITY_RADIUS = 96;
const APPROACH_PET_SUCCESS_RADIUS = 64;
const APPROACH_PET_TIMEOUT_MS = 4_000;
const APPROACH_PET_SUCCESS_CUE_MS = 1_000;

// Cursor play — laser-pointer-style chase.
const CHASE_CURSOR_SUCCESS_RADIUS = 48;
const CHASE_CURSOR_TIMEOUT_MS = 4_000;
const CHASE_CURSOR_SUCCESS_CUE_MS = 1_000;

const COLLISION_EXPIRABLE_AUTONOMOUS_REASONS = new Set<string>([
  "work-focus",
  "work-review",
  "work-pace",
  "collision-flee",
  "collision-engage",
  "collision-avoid",
  "collision-stay",
  "collision-jump",
  "collision-unfazed",
]);

// Phase 3: social interaction distances
const PET_FLEE_WIDTH_MULTIPLIER = 6;
const _DEFAULT_WANDER_BODY_WIDTH = DEFAULT_BEHAVIOR_BODY_WIDTH;
const _WANDER_BASE_BODY_MULTIPLIER = 3;

// Phase 4: collision reaction constants
const PET_ENGAGE_STOP_WIDTH_MULTIPLIER = 2.5;

// B3: after reacting to a specific neighbor, ignore further collisions with
// that same neighbor for this long. Physical separation is not gated — the
// Matter solver keeps pushing the bodies apart; only the behavioral
// re-reaction is suppressed.
const PAIR_COLLISION_COOLDOWN_MS = 6_000;
const COLLISION_MEMORY_MAX_ENTRIES = 8;

function isPairCoolingDown(
  components: ComponentStore,
  id: string,
  otherId: string,
  now: number,
): boolean {
  const memory = components.getComponent(id, "CollisionMemory");
  const entry = memory?.entries.find((e) => e.otherId === otherId);
  return !!entry && now - entry.lastReactedAt < PAIR_COLLISION_COOLDOWN_MS;
}

function recordPairReaction(
  components: ComponentStore,
  id: string,
  otherId: string,
  now: number,
): void {
  const memory = components.getComponent(id, "CollisionMemory");
  // Lazy pruning: drop the entry being refreshed and anything already lapsed.
  const entries = (memory?.entries ?? []).filter(
    (e) => e.otherId !== otherId && now - e.lastReactedAt < PAIR_COLLISION_COOLDOWN_MS,
  );
  entries.push({ otherId, lastReactedAt: now });
  while (entries.length > COLLISION_MEMORY_MAX_ENTRIES) entries.shift();
  components.setComponent(id, { type: "CollisionMemory", entries });
}

// ── Drives satisfaction hooks ────────────────────────────────────────────
// Magnitudes on the same 0..1 scale as DrivesComponent fields. "Substantial"
// refills (catching a pet) are larger than "partial" ones (a friendly
// collision reaction); costs are small enough that a pet needs several
// jumps/climbs before it visibly tires. The jump cost itself is in
// `activity-tuning.ts`, where the romp hop derives from it.
const APPROACH_PET_SUCCESS_SOCIAL_REFILL = 0.5;
const COLLISION_ENGAGE_SOCIAL_REFILL = 0.15;
const WANDER_FAR_CURIOSITY_RELIEF = 0.35;
const CLIMB_CURIOSITY_RELIEF = 0.3;
const CLIMB_ENERGY_COST = 0.12;

// idle-stay: a real rest. Introverts settle for much longer than extraverts.
const IDLE_STAY_BASE_MS = 3_000;
const IDLE_STAY_INTROVERSION_MS = 9_000;
const IDLE_STAY_JITTER_MS = 3_000;

// A positional wander target the pet cannot make progress toward — jammed
// against a side wall or an interior monitor step (the hidden wall an L-shaped
// dual-monitor layout leaves at its height step) — is abandoned after this
// long with no improvement, so the pet returns to idle and re-decides instead
// of pushing into the wall forever. A shrink smaller than the epsilon counts as
// no progress, so slow-but-real walking keeps refreshing the timer while pure
// jitter against a wall does not.
const WANDER_STUCK_TIMEOUT_MS = 2_500;
const WANDER_PROGRESS_EPSILON = 2;

/** Personality-scaled rest length for an idle-stay decision. */
function idleStayDurationMs(p: PersonalityComponent, random: RandomSource): number {
  return Math.round(
    (IDLE_STAY_BASE_MS +
      (1 - p.extraversion) * IDLE_STAY_INTROVERSION_MS +
      random.next() * IDLE_STAY_JITTER_MS) *
      personalityIdleDurationScale(p.catalogId),
  );
}

// Priority 3: Collision avoidance (entity overlap).
export function runCollisionBehaviorSystem(
  components: ComponentStore,
  _bounds: { x?: number; y?: number; width: number; height: number },
  clock: Clock,
): void {
  const now = clock.now();

  type Collidable = {
    id: string;
    x: number;
    y: number;
    halfW: number;
    halfH: number;
    mode: string;
    targetX: number | null;
    targetY: number | null;
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
  type CollisionCandidate = { id: string; x: number; y: number };

  const entities: Collidable[] = [];
  components.forEach(
    ["Transform", "PhysicsBody", "Steering", "MotionTarget"],
    (id, [transform, body, intent, motion]) => {
      entities.push({
        id,
        x: transform.position.x,
        y: transform.position.y,
        halfW: body.width / 2,
        halfH: body.height / 2,
        mode: intent.mode,
        targetX: motion.targetPosition?.x ?? null,
        targetY: motion.targetPosition?.y ?? null,
        motion,
      });
    },
  );

  // Pass 1 — expire stale collision claims for entities that are no longer
  // overlapping.  Without this, a pet that successfully moved to its avoidance
  // position stays frozen idle until the 1 s claim expires even though it is
  // already clear of the other entity.  Expiring immediately lets
  // BehaviorDecisionSystem pick a new behavior in the same frame.
  for (const entity of entities) {
    if (components.getComponent(entity.id, "ClimbingTag")) continue;
    if (components.getComponent(entity.id, "AirborneTag")) {
      const existing = components.getComponent(entity.id, "BehaviorDecisionState");
      if (existing?.source === "collision" && existing.expiresAt > now) {
        existing.expiresAt = now;
        components.removeComponent(entity.id, "PendingReaction");
      }
      continue;
    }
    const existing = components.getComponent(entity.id, "BehaviorDecisionState");
    if (existing?.source !== "collision" || existing.expiresAt <= now) continue;

    const stillOverlapping =
      !!components.getComponent(entity.id, "PetCollision") ||
      entities.some(
        (c) =>
          c.id !== entity.id &&
          Math.abs(c.x - entity.x) < entity.halfW + c.halfW &&
          Math.abs(c.y - entity.y) < entity.halfH + c.halfH,
      );

    if (!stillOverlapping) {
      existing.expiresAt = now; // allow BehaviorDecisionSystem to act this frame
    }
  }

  // Pass 2 — write PendingReaction for currently-overlapping entities.
  // Phase 4: pets "freeze" until reactsAt; BehaviorDecisionSystem then picks
  // a personality-shaped response (collision-flee/engage/avoid/unfazed).
  for (const entity of entities) {
    // Do not disrupt a climbing entity or one that is mid-approach to a surface.
    if (components.getComponent(entity.id, "ClimbingTag")) continue;
    if (components.getComponent(entity.id, "AirborneTag")) continue;
    if (components.getComponent(entity.id, "ClimbIntentState")?.phase === "approaching") continue;
    const agentTask = components.getComponent(entity.id, "AgentTaskState");
    const isWorking = agentTask?.status === "working";
    if (isWorking) {
      if (isClaimed(components, entity.id, "collision", now)) continue;
    } else if (isClaimedBySameOrHigherPriority(components, entity.id, "collision", now)) {
      continue;
    }
    // Skip if a reaction is already pending (avoid overwriting mid-deliberation).
    if (!isWorking && components.getComponent(entity.id, "PendingReaction")) continue;

    const collision: CollisionCandidate | undefined =
      matterPetCollisionCandidate(components, entity, entities) ??
      entities.find(
        (c) =>
          c.id !== entity.id &&
          Math.abs(c.x - entity.x) < entity.halfW + c.halfW &&
          Math.abs(c.y - entity.y) < entity.halfH + c.halfH,
      );
    if (!collision) continue;
    // B2: contact with a co-participant in the same session is expected
    // choreography (greet gaps close in, chases catch), never a startle. This
    // also covers the brief windows where the social claim is not live — e.g.
    // right at teardown before the afterglow claim lands. Matching by
    // sessionId (not partnerId) keeps every member of a group immune to every
    // other, not just its representative partner.
    const sessionMember = components.getComponent(entity.id, "SocialSessionMember");
    if (sessionMember) {
      const otherMember = components.getComponent(collision.id, "SocialSessionMember");
      if (otherMember?.sessionId === sessionMember.sessionId) continue;
    }
    // B3: already reacted to this particular neighbor recently — coexist.
    if (isPairCoolingDown(components, entity.id, collision.id, now)) continue;
    if (isWorking) {
      const personality = components.getComponent(entity.id, "Personality");
      if (personality) {
        const expression = workingCollisionExpression(personality);
        components.setComponent(entity.id, {
          type: "PetExpressionState",
          source: "collision",
          ...expression,
          startedAt: now,
          expiresAt: now + workingCollisionExpressionDurationMs(personality),
        });
      }
      components.removeComponent(entity.id, "PendingReaction");

      components.setComponent(entity.id, {
        type: "MotionTarget" as const,
        targetEntityId: null,
        targetPosition: null,
      });
      // `stand`, not a travel mode: the target was just cleared, so there is
      // nothing to pursue. BehaviorDecisionSystem only re-decides for a pet
      // that is standing with no target, so leaving a travel mode here strands
      // a working pet in "pursuing nothing" — it then holds its first work
      // decision for the rest of the task and never picks another behavior.
      components.setComponent(entity.id, {
        type: "Steering" as const,
        mode: "stand",
      });

      const existing = components.getComponent(entity.id, "BehaviorDecisionState");
      if (
        existing &&
        (existing.source === "collision" ||
          (existing.source === "autonomous" &&
            COLLISION_EXPIRABLE_AUTONOMOUS_REASONS.has(existing.reason)))
      ) {
        existing.expiresAt = now;
      }

      recordPairReaction(components, entity.id, collision.id, now);
      recordPetExperience(components, entity.id, "startled", now);
      continue;
    }
    if (isEscapingCollisionFlee(components, entity, collision)) continue;

    const personality = components.getComponent(entity.id, "Personality");
    const latency = personality ? reactionLatencyMs(personality, "collision") : 400;
    const reactsAt = now + latency;

    components.setComponent(entity.id, {
      type: "PendingReaction",
      source: "collision",
      triggeredAt: now,
      reactsAt,
      context: {
        otherEntityId: collision.id,
        otherPosition: { x: collision.x, y: collision.y },
      },
    } satisfies PendingReactionComponent);
    recordPetExperience(components, entity.id, "startled", now);

    // Freeze the pet immediately: clear existing MotionTarget and reset intent
    // to idle so locomotion systems see no active goal and the pet stops.
    // Without this, a pet heading toward its approach-pet target keeps flying
    // into the collider throughout the deliberation window.
    components.setComponent(entity.id, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    components.setComponent(entity.id, { type: "Steering", mode: "stand" });

    // Hold the claim until reactsAt so BehaviorDecisionSystem skips this pet
    // during the deliberation window.
    claim(components, entity.id, "collision", now, "entity overlap", reactsAt);
    recordPairReaction(components, entity.id, collision.id, now);
  }
}

// ── Phase 4: Reaction latency ─────────────────────────────────────────────
//
// High N (anxiety) → longer freeze before reacting.
// High E (extraversion) → snappier reaction.
// Clamped to 0..2000 ms.

function matterPetCollisionCandidate(
  components: ComponentStore,
  entity: { id: string },
  entities: Array<{ id: string; x: number; y: number }>,
): { id: string; x: number; y: number } | undefined {
  const petCollision = components.getComponent(entity.id, "PetCollision");
  if (!petCollision) return undefined;

  const liveEntity = entities.find((candidate) => candidate.id === petCollision.otherEntityId);
  return (
    liveEntity ?? {
      id: petCollision.otherEntityId,
      x: petCollision.otherPosition.x,
      y: petCollision.otherPosition.y,
    }
  );
}

function isEscapingCollisionFlee(
  components: ComponentStore,
  entity: {
    id: string;
    x: number;
    y: number;
    mode: string;
    targetX: number | null;
    targetY: number | null;
  },
  collision: { x: number; y: number },
): boolean {
  if (entity.mode !== "pursue") return false;
  if (entity.targetX == null || entity.targetY == null) return false;

  const decision = components.getComponent(entity.id, "BehaviorDecisionState");
  if (decision?.reason !== "collision-flee") return false;

  const currentDistanceSquared = (entity.x - collision.x) ** 2 + (entity.y - collision.y) ** 2;
  const targetDistanceSquared =
    (entity.targetX - collision.x) ** 2 + (entity.targetY - collision.y) ** 2;
  const movementX = entity.targetX - entity.x;
  const movementY = entity.targetY - entity.y;
  const awayX = entity.x - collision.x;
  const awayY = entity.y - collision.y;

  return (
    targetDistanceSquared > currentDistanceSquared && movementX * awayX + movementY * awayY > 0
  );
}

function reactionLatencyMs(p: PersonalityComponent, source: ReactionSource): number {
  const baseMs = source === "collision" ? 400 : source === "agent-event" ? 250 : 200;
  const latency = baseMs * (1 + p.neuroticism * 1.5 - p.extraversion * 0.5);
  return Math.max(0, Math.min(2000, latency));
}

// ── Phase 4: Collision response score functions ───────────────────────────

function workingCollisionExpressionDurationMs(personality: PersonalityComponent): number {
  const duration =
    550 +
    personality.neuroticism * 350 +
    (1 - personality.agreeableness) * 200 +
    personality.extraversion * 100 -
    personality.conscientiousness * 250;
  return Math.round(clamp(duration, 350, 900));
}

function workingCollisionExpression(personality: PersonalityComponent): {
  mood: PetExpressionMood;
  emote: PetExpressionEmote;
  label: string | null;
} {
  if (personality.neuroticism >= 0.65 || personality.agreeableness <= 0.3) {
    return { mood: "confused", emote: "exclaim", label: "!" };
  }

  if (personality.agreeableness >= 0.75 && personality.neuroticism <= 0.35) {
    return { mood: "love", emote: "heart", label: null };
  }

  if (personality.conscientiousness >= 0.75 || personality.neuroticism <= 0.2) {
    return { mood: "working", emote: "none", label: null };
  }

  return { mood: "thinking", emote: "question", label: null };
}

function scoreCollisionFlee(p: PersonalityComponent): number {
  // N → flee instinct; A → reduce (agreeable pets less likely to flee)
  return 0.2 + p.neuroticism * 0.7 - p.agreeableness * 0.5;
}

function scoreCollisionEngage(p: PersonalityComponent): number {
  // E + A → curiosity/warmth; N → avoidance
  return 0.2 + p.extraversion * 0.5 + p.agreeableness * 0.5 - p.neuroticism * 0.4;
}

function scoreCollisionAvoid(): number {
  // Always a neutral fallback — perpendicular sidestep
  return 0.4;
}

function scoreCollisionJump(p: PersonalityComponent): number {
  return 1.2 + p.extraversion * 0.45 + p.openness * 0.25 + p.neuroticism * 0.15;
}

function scoreCollisionStay(p: PersonalityComponent): number {
  // A + calm introversion → comfortable staying close without re-approaching.
  return 0.05 + p.agreeableness * 0.3 + (1 - p.extraversion) * 1 + (1 - p.neuroticism) * 0.1;
}

function scoreCollisionUnfazed(p: PersonalityComponent): number {
  // Low N → composure; high N → less likely to shrug it off
  return 0.15 + (1 - p.neuroticism) * 0.4;
}

function constrainCollisionDirectionForLocomotion(
  components: ComponentStore,
  id: string,
  otherId: string | undefined,
  away: Vector,
): Vector {
  if (!isHorizontalOnlyCollisionResponse(components, id)) return away;
  if (Math.abs(away.x) > 0.2) {
    return { x: Math.sign(away.x), y: 0 };
  }

  return {
    x: fallbackHorizontalDirection(id, otherId),
    y: 0,
  };
}

function isHorizontalOnlyCollisionResponse(components: ComponentStore, id: string): boolean {
  return (
    !!components.getComponent(id, "WalkingTag") &&
    !components.getComponent(id, "FlyingTag") &&
    !components.getComponent(id, "ClimbingTag")
  );
}

function isPendingReactionStillOverlapping(
  components: ComponentStore,
  id: string,
  pendingReaction: PendingReactionComponent,
): boolean {
  const otherId = pendingReaction.context.otherEntityId;
  if (!otherId) return false;

  const transform = components.getComponent(id, "Transform");
  const body = components.getComponent(id, "PhysicsBody");
  const otherTransform = components.getComponent(otherId, "Transform");
  const otherBody = components.getComponent(otherId, "PhysicsBody");
  if (!transform || !body || !otherTransform || !otherBody) return false;

  return (
    Math.abs(transform.position.x - otherTransform.position.x) <
      body.width / 2 + otherBody.width / 2 &&
    Math.abs(transform.position.y - otherTransform.position.y) <
      body.height / 2 + otherBody.height / 2
  );
}

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

// ── Softmax sampling ─────────────────────────────────────────────────────
//
// Temperature T = T_BASE * (1 + ALPHA_T * neuroticism):
//   • Low N  (e.g. 0.1) → T ≈ 0.28  → distribution concentrated on top scorer
//   • High N (e.g. 0.9) → T ≈ 0.52  → distribution is more uniform / erratic
//
// A single random.next() call per selection; no per-candidate jitter.

const T_BASE = 0.25;
const ALPHA_T = 1.2;

function softmaxSample(
  candidates: Candidate[],
  neuroticism: number,
  random: RandomSource,
): { winner: Candidate; trace: BehaviorDecisionSelectionTrace } {
  const T = T_BASE * (1 + ALPHA_T * neuroticism);
  // Subtract max before exp() to prevent overflow when future phases add
  // high-magnitude scores (approach-pet, flee, collision response, etc.).
  let maxScore = -Infinity;
  for (const candidate of candidates) {
    if (candidate.score > maxScore) maxScore = candidate.score;
  }

  const weights = candidates.map((candidate) => Math.exp((candidate.score - maxScore) / T));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  const randomRoll = random.next();
  let r = randomRoll * total;
  let winner = candidates[candidates.length - 1];
  for (const [index, candidate] of candidates.entries()) {
    r -= weights[index];
    if (r <= 0) {
      winner = candidate;
      break;
    }
  }

  let cumulativeProbability = 0;
  const trace: BehaviorDecisionSelectionTrace = {
    temperature: T,
    randomRoll,
    totalWeight: total,
    selectedKind: winner.kind,
    candidates: candidates.map((candidate, index) => {
      const probability = weights[index] / total;
      cumulativeProbability += probability;
      return {
        kind: candidate.kind,
        score: candidate.score,
        weight: weights[index],
        probability,
        cumulativeProbability,
        selected: candidate.kind === winner.kind,
      };
    }),
  };

  return { winner, trace };
}

// ── BehaviorDecisionSystem helpers ────────────────────────────────────────

// ── BehaviorDecisionSystem (priority 4: autonomous) ──────────────────────
//
// Trigger: no active claim AND intent === "idle" AND no motion target.
// Scores all candidates using OCEAN Personality weights, then samples a winner
// via softmax (temperature scales with neuroticism: high N → flatter distribution).
// Emits a BehaviorDecisionToken and claims the entity with source="autonomous".
// Does NOT mutate MotionTarget / Steering / JumpActionState / ClimbIntentState —
// that is the responsibility of BehaviorPlanningSystem.

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

      const petX = transform.position.x;
      const petY = transform.position.y;
      // Optional — undefined for pets built before this feature. Every
      // drives-aware score function below falls back to its original
      // personality-only formula when this is undefined.
      const drives = components.getComponent(id, "Drives");
      const mood = components.getComponent(id, "MoodState");

      // Phase 4: PendingReaction present → claim just expired at reactsAt.
      // Route to the personality-shaped reactive candidate pool instead of
      // the normal autonomous pool.
      const pendingReaction = components.getComponent(id, "PendingReaction");
      if (pendingReaction) {
        const otherPos = pendingReaction.context.otherPosition ?? {
          x: petX + 100,
          y: petY,
        };
        const away = normalize({ x: petX - otherPos.x, y: petY - otherPos.y });
        const movementAway = constrainCollisionDirectionForLocomotion(
          components,
          id,
          pendingReaction.context.otherEntityId,
          away,
        );
        const side = isHorizontalOnlyCollisionResponse(components, id)
          ? movementAway
          : { x: -away.y, y: away.x };
        const reactionDistance = petWidth(components, id) * COLLISION_REACTION_WIDTH_MULTIPLIER;
        const engageStopDistance = petWidth(components, id) * PET_ENGAGE_STOP_WIDTH_MULTIPLIER;
        const stillOverlapping = isPendingReactionStillOverlapping(components, id, pendingReaction);
        const canCollisionJump =
          stillOverlapping &&
          !!components.getComponent(id, "CanJump") &&
          !components.getComponent(id, "JumpActionState") &&
          !!components.getComponent(id, "WalkingTag") &&
          !components.getComponent(id, "FlyingTag") &&
          !components.getComponent(id, "ClimbingTag") &&
          (components.getComponent(id, "ContactState")?.grounded ?? true);

        const fleeTarget = {
          x: clampToBoundsX(
            petX + movementAway.x * reactionDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: clampToBoundsY(
            petY + movementAway.y * reactionDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
        };
        // engageTarget sits 80 px from the other pet on SELF's side — close
        // enough to "engage" but not so close that the pet walks straight
        // through. `away` points from other to self, so adding (not subtracting)
        // it to otherPos keeps the target between the two pets. The earlier
        // `otherPos - away * D` placed the target on the FAR side, causing pets
        // to walk through each other and immediately re-collide (cluster bug).
        const engageTarget = {
          x: clampToBoundsX(
            otherPos.x + movementAway.x * engageStopDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: clampToBoundsY(
            otherPos.y + movementAway.y * engageStopDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
        };
        const avoidTarget = {
          x: clampToBoundsX(petX + side.x * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
          y: clampToBoundsY(petY + side.y * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
        };
        // B4: for a socializable pair the bump-to-greet conversion (in
        // SocialInteractionSystem, earlier this tick) supersedes the engage
        // reaction — reaching this point means the pet rolled against
        // inviting, so "walk close and stop" would be a mixed signal. Engage
        // stays available toward non-socializable entities.
        const bumpOtherId = pendingReaction.context.otherEntityId;
        const bumpSupersedesEngage =
          !!bumpOtherId && isBumpSocialEligible(components, id, bumpOtherId, now);
        const reactiveCandidates: Candidate[] = [
          {
            kind: "collision-flee",
            score: scoreCollisionFlee(personality),
            build: () => ({ targetPosition: fleeTarget }),
          },
          ...(bumpSupersedesEngage
            ? []
            : [
                {
                  kind: "collision-engage" as const,
                  score: scoreCollisionEngage(personality),
                  build: () => ({ targetPosition: engageTarget }),
                },
              ]),
          {
            kind: "collision-avoid",
            score: scoreCollisionAvoid(),
            build: () => ({ targetPosition: avoidTarget }),
          },
        ];
        if (canCollisionJump) {
          reactiveCandidates.push({
            kind: "collision-jump",
            score: scoreCollisionJump(personality),
            build: () => ({ targetPosition: fleeTarget }),
          });
        }
        if (!stillOverlapping) {
          reactiveCandidates.push({
            kind: "collision-stay",
            score: scoreCollisionStay(personality),
            build: () => ({}),
          });
        }
        reactiveCandidates.push({
          kind: "collision-unfazed",
          score: scoreCollisionUnfazed(personality),
          // unfazedTarget is computed lazily in build() so random is consumed
          // only if this candidate wins, keeping the softmax r-draw stable.
          //
          // NOTE: plan specified "re-emit previous goal" (copy MotionTarget before
          // collision disrupted it). Current implementation picks a fresh wander-near
          // position instead — intentional simplification. The visual result is similar
          // ("stays nearby") but the pet doesn't resume its original trajectory.
          // Restore-previous-goal semantics deferred to Phase 6 visual review.
          build: () => ({
            targetPosition: pickWanderPosition(
              petX,
              petY,
              bounds,
              random,
              "near",
              personality,
              petWidth(components, id),
            ),
          }),
        });

        const reactionSelection = softmaxSample(
          reactiveCandidates.map((candidate) => ({
            ...candidate,
            score: moodAdjustedDecisionScore(
              candidate.kind,
              signedDecisionScore(personality.catalogId, candidate.kind, candidate.score),
              mood,
            ),
          })),
          personality.neuroticism,
          random,
        );
        const reactionWinner = reactionSelection.winner;
        components.setComponent(id, {
          type: "BehaviorDecisionToken",
          kind: reactionWinner.kind,
          decidedAt: now,
          consumed: false,
          selectionTrace: reactionSelection.trace,
          ...reactionWinner.build(),
        });
        claim(components, id, "autonomous", now, reactionWinner.kind);
        components.removeComponent(id, "PendingReaction");
        return;
      }

      const agentTask = components.getComponent(id, "AgentTaskState");
      if (agentTask?.status === "working") {
        const style = workingStyle(personality);
        const signal = components.getComponent(id, "AgentActivitySignal");
        const freshActivity =
          signal && now - signal.at <= TOOL_ACTIVITY_FRESHNESS_MS ? signal.activity : null;
        const holdMs = workingBehaviorHoldMs(style, random.next());
        const workingCandidates: Candidate[] = [
          {
            kind: "work-focus",
            score: style.focusScore + (freshActivity === "edit" ? 0.35 : 0),
            build: () => ({ activityDurationMs: holdMs }),
          },
          {
            kind: "work-review",
            score: style.reviewScore + (freshActivity === "study" ? 0.35 : 0),
            build: () => ({ activityDurationMs: holdMs }),
          },
          {
            kind: "work-pace",
            score: style.paceScore + (freshActivity === "run" ? 0.35 : 0),
            build: () => ({
              activityDurationMs: holdMs,
              targetPosition: pickWanderPosition(
                petX,
                petY,
                bounds,
                random,
                "near",
                personality,
                petWidth(components, id),
              ),
            }),
          },
        ];
        const workingSelection = softmaxSample(workingCandidates, personality.neuroticism, random);
        const winner = workingSelection.winner;
        const tokenFields = winner.build();
        components.setComponent(id, {
          type: "BehaviorDecisionToken",
          kind: winner.kind,
          decidedAt: now,
          consumed: false,
          selectionTrace: workingSelection.trace,
          ...tokenFields,
        });
        claim(
          components,
          id,
          "autonomous",
          now,
          winner.kind,
          now + (tokenFields.activityDurationMs ?? holdMs),
        );
        return;
      }

      // Read world context from this pet's Perception snapshot.
      const perception = components.getComponent(id, "Perception");
      const perceptionAnchor = perception?.userAnchor;
      const userAnchor: { id: string; x: number; y: number } | null = perceptionAnchor
        ? {
            id: perceptionAnchor.id,
            x: perceptionAnchor.position.x,
            y: perceptionAnchor.position.y,
          }
        : null;

      const isFlying = !!components.getComponent(id, "FlyingTag");

      const candidates: Candidate[] = [];

      pushCandidate(candidates, components, id, now, {
        kind: "wander-near",
        score: scoreWanderNear(personality),
        build: () => ({
          targetPosition: pickWanderPosition(
            petX,
            petY,
            bounds,
            random,
            "near",
            personality,
            petWidth(components, id),
          ),
        }),
      });

      pushCandidate(candidates, components, id, now, {
        kind: "wander-far",
        score: scoreWanderFar(personality, drives),
        build: () => ({
          targetPosition: pickWanderPosition(
            petX,
            petY,
            bounds,
            random,
            "far",
            personality,
            petWidth(components, id),
          ),
        }),
      });

      if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "seek-user",
          score: scoreSeekUser(personality, drives),
          // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
          // seek positioning; Planning only needs to promote intent to "seek".
          build: () => ({}),
        });
      }

      // Cursor play — a fast/darting cursor near this pet offers chase-cursor,
      // independent of the seek-user proximity gate above (playful chasing can
      // happen right next to the user, unlike the "come say hi" seek-user drive).
      if (userAnchor && perception?.cursor?.isPlayful) {
        pushCandidate(candidates, components, id, now, {
          kind: "chase-cursor",
          score: scoreChaseCursor(personality),
          build: () => ({
            targetEntityId: userAnchor.id,
            targetPosition: { x: userAnchor.x, y: userAnchor.y },
          }),
        });
      }

      const canJump = components.getComponent(id, "CanJump");
      const jumpState = components.getComponent(id, "JumpActionState");
      const contact = components.getComponent(id, "ContactState");
      if (canJump && !jumpState && (!contact || contact.grounded)) {
        pushCandidate(candidates, components, id, now, {
          kind: "request-jump",
          score: scoreJump(personality, drives),
          // Jump is a one-shot action; Planning reads JumpActionState directly.
          build: () => ({}),
        });
      }

      // Sustained solo play: a grounded walker can string hops and dashes
      // together for several seconds (RompProgressSystem choreographs it).
      const isGroundedWalker =
        !!components.getComponent(id, "WalkingTag") &&
        !isFlying &&
        !components.getComponent(id, "ClimbingTag") &&
        (!contact || contact.grounded);
      if (canJump && !jumpState && isGroundedWalker && personality.catalogId === "playful") {
        pushCandidate(candidates, components, id, now, {
          kind: "play-romp",
          score: scorePlayRomp(personality, drives),
          build: () => ({
            activityDurationMs: Math.round(ROMP_BASE_MS + random.next() * ROMP_EXTRA_MS),
          }),
        });
      }

      const canClimb = components.getComponent(id, "CanWallClimb");
      const climbing = components.getComponent(id, "ClimbingTag");
      const climbDismount = components.getComponent(id, "ClimbDismountState");
      if (canClimb && !climbing && (!climbDismount || climbDismount.phase === "ready")) {
        // Nearest climbable surface from Perception; skip if already reserved.
        const nearestClimbable = perception?.nearbyClimbables[0];
        const surface =
          nearestClimbable && !claimedSurfaces.has(nearestClimbable.id)
            ? {
                id: nearestClimbable.id,
                x: nearestClimbable.position.x,
                y: nearestClimbable.position.y,
              }
            : null;
        if (surface) {
          pushCandidate(candidates, components, id, now, {
            kind: "request-climb",
            score: scoreClimb(personality, drives),
            build: () => {
              // Reserve the surface so later entities in this same pass won't
              // double-target it (build() runs before the next entity is processed).
              claimedSurfaces.add(surface.id);
              return {
                climbSurfaceId: surface.id,
                climbTargetY: surface.y - 80,
              };
            },
          });
        }
      }

      // Phase 3: social candidates — only when another pet is within perception range.
      const nearbyPets = perception?.nearbyPets ?? [];
      if (nearbyPets.length > 0) {
        const nearestPet = nearbyPets[0];
        pushCandidate(candidates, components, id, now, {
          kind: "approach-pet",
          score: scoreApproachPet(personality, drives),
          // Keep the entity id so MotionTargetSystem can track the moving pet
          // until a collision reaction interrupts the approach.
          build: () => ({
            targetEntityId: nearestPet.id,
            targetPosition: { ...nearestPet.position },
          }),
        });

        const fleeDirX = petX - nearestPet.position.x;
        const fleeDirY = petY - nearestPet.position.y;
        const fleeLen = Math.hypot(fleeDirX, fleeDirY) || 1;
        const fleeDistance = petWidth(components, id) * PET_FLEE_WIDTH_MULTIPLIER;
        const fleePos = {
          x: clampToBoundsX(
            petX + (fleeDirX / fleeLen) * fleeDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: clampToBoundsY(
            petY + (fleeDirY / fleeLen) * fleeDistance,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
        };
        pushCandidate(candidates, components, id, now, {
          kind: "flee-from-pet",
          score: scoreFleeFromPet(personality),
          build: () => ({ targetPosition: fleePos }),
        });
      }

      // Expressive idle poses — sustained, stationary gestures that light up
      // the otherwise agent-only sprite rows. Each is gated to the context that
      // makes it read, then materialized as a claim held for its whole
      // duration. Greeting waves at the user when they are near (pet-to-pet
      // hellos are already served by approach-pet); beckoning calls the user
      // over when they are far. Catalog-exclusive poses are gated by both
      // user distance and catalog id so their silhouettes do not leak into
      // neighboring personalities.
      if (userAnchor && isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "greet",
          score: scoreGreet(personality, drives),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("greet", random) }),
        });
        if (isGroundedWalker && personality.catalogId === "mischievous") {
          pushCandidate(candidates, components, id, now, {
            kind: "play-feint",
            score: scorePlayFeint(personality),
            build: () => ({
              targetEntityId: userAnchor.id,
              targetPosition: { x: userAnchor.x, y: userAnchor.y },
              activityDurationMs: Math.round(FEINT_BASE_MS + random.next() * FEINT_EXTRA_MS),
            }),
          });
        }
        if (isGroundedWalker && personality.catalogId === "attentive") {
          pushCandidate(candidates, components, id, now, {
            kind: "keep-watch",
            score: scoreKeepWatch(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("keep-watch", random),
            }),
          });
        }
        if (isGroundedWalker && personality.catalogId === "gentle") {
          pushCandidate(candidates, components, id, now, {
            kind: "offer-comfort",
            score: scoreOfferComfort(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("offer-comfort", random),
            }),
          });
        }
        if (isGroundedWalker && personality.catalogId === "aloof") {
          const direction =
            petX === userAnchor.x ? (random.next() < 0.5 ? -1 : 1) : Math.sign(petX - userAnchor.x);
          const targetPosition = {
            x: clampToBoundsX(
              petX + direction * petWidth(components, id) * WITHDRAW_BODY_WIDTHS,
              bounds,
              COLLISION_TARGET_MARGIN,
            ),
            y: petY,
          };
          pushCandidate(candidates, components, id, now, {
            kind: "withdraw",
            score: scoreWithdraw(personality),
            build: () => ({
              targetPosition,
              activityDurationMs: WITHDRAW_DURATION_MS,
            }),
          });
        }
      }

      if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "beckon",
          score: scoreBeckon(personality, drives),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("beckon", random) }),
        });
        if (isGroundedWalker && personality.catalogId === "reserved") {
          pushCandidate(candidates, components, id, now, {
            kind: "peek",
            score: scorePeek(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("peek", random),
            }),
          });
        }
      }

      if (isGroundedWalker) {
        if (personality.catalogId === "curious") {
          pushCandidate(candidates, components, id, now, {
            kind: "inspect",
            score: scoreInspect(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("inspect", random),
            }),
          });
        }
        if (personality.catalogId === "steady") {
          pushCandidate(candidates, components, id, now, {
            kind: "follow-routine",
            score: scoreFollowRoutine(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("follow-routine", random),
            }),
          });
        }
        if (personality.catalogId === "feisty") {
          const direction = random.next() < 0.5 ? -1 : 1;
          const distance = petWidth(components, id) * STRUT_BODY_WIDTHS;
          const preferredX = clampToBoundsX(
            petX + direction * distance,
            bounds,
            COLLISION_TARGET_MARGIN,
          );
          const alternateX = clampToBoundsX(
            petX - direction * distance,
            bounds,
            COLLISION_TARGET_MARGIN,
          );
          const targetX =
            Math.abs(preferredX - petX) >= Math.abs(alternateX - petX) ? preferredX : alternateX;
          pushCandidate(candidates, components, id, now, {
            kind: "strut",
            score: scoreStrut(personality),
            build: () => ({
              targetPosition: {
                x: targetX,
                y: petY,
              },
              activityDurationMs: STRUT_DURATION_MS,
            }),
          });
        }
        if (personality.catalogId === "skittish") {
          pushCandidate(candidates, components, id, now, {
            kind: "stand-lookout",
            score: scoreStandLookout(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("stand-lookout", random),
            }),
          });
        }
        pushCandidate(candidates, components, id, now, {
          kind: "groom",
          score: scoreGroom(personality),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("groom", random) }),
        });
        pushCandidate(candidates, components, id, now, {
          kind: "observe",
          score: scoreObserve(personality, drives),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("observe", random) }),
        });
        pushCandidate(candidates, components, id, now, {
          kind: "fret",
          score: scoreFret(personality),
          build: () => ({ activityDurationMs: expressivePoseDurationMs("fret", random) }),
        });
        if (personality.catalogId === "lazy") {
          pushCandidate(candidates, components, id, now, {
            kind: "nap",
            score: scoreNap(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("nap", random),
            }),
          });
        }
        if (personality.catalogId === "zen") {
          pushCandidate(candidates, components, id, now, {
            kind: "meditate",
            score: scoreMeditate(personality),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs("meditate", random),
            }),
          });
        }

        // Second signature pose per personality — a catalog-exclusive stationary
        // beat that stands alongside each preset's first signature. All hold a
        // still pose, so they share the expressive materialization path; only
        // the choreography, cue, and gating differ.
        const secondSignature = SECOND_SIGNATURE_POSE[personality.catalogId ?? ""];
        if (secondSignature) {
          pushCandidate(candidates, components, id, now, {
            kind: secondSignature.kind,
            score: secondSignature.score(personality, drives),
            build: () => ({
              activityDurationMs: expressivePoseDurationMs(secondSignature.kind, random),
            }),
          });
        }
      }

      pushCandidate(candidates, components, id, now, {
        kind: "idle-stay",
        score: scoreIdleStay(personality, drives),
        build: () => ({}),
      });

      if (candidates.length === 0) return;
      // Softmax sampling: temperature scales with neuroticism.
      // High N → higher T → flatter distribution → more erratic behaviour.
      const selection = softmaxSample(
        candidates.map((candidate) => ({
          ...candidate,
          score: moodAdjustedDecisionScore(
            candidate.kind,
            signedDecisionScore(personality.catalogId, candidate.kind, candidate.score),
            mood,
          ),
        })),
        personality.neuroticism,
        random,
      );
      const winner = selection.winner;
      const tokenFields = winner.build();
      components.setComponent(id, {
        type: "BehaviorDecisionToken",
        kind: winner.kind,
        decidedAt: now,
        consumed: false,
        selectionTrace: selection.trace,
        ...tokenFields,
      });
      // Sustained activities hold their claim for their whole duration:
      // idle-stay becomes a genuine, personality-length rest instead of a
      // 500 ms pause before the next re-roll, and play-romp keeps its claim
      // while RompProgressSystem choreographs the hops.
      const activityExpiresAt =
        winner.kind === "idle-stay"
          ? now + idleStayDurationMs(personality, random)
          : tokenFields.activityDurationMs !== undefined
            ? now + tokenFields.activityDurationMs
            : undefined;
      claim(components, id, "autonomous", now, winner.kind, activityExpiresAt);
    },
  );
}

// ── BehaviorPlanningSystem ────────────────────────────────────────────────
//
// Runs at end of BEHAVIOR phase, after BehaviorDecisionSystem.
// Reads the unconsumed BehaviorDecisionToken and materializes it into
// concrete state components (MotionTarget, Steering, JumpActionState,
// ClimbIntentState). Marks the token consumed when done.

export function runBehaviorPlanningSystem(components: ComponentStore, _clock: Clock): void {
  components.forEach(["BehaviorDecisionToken"], (id, [token]) => {
    if (token.consumed) return;
    switch (token.kind) {
      case "wander-near":
      case "work-pace":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      case "wander-far":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        // Venturing far resolves some of the pet's need for novelty.
        adjustDrive(components, id, {
          curiosity: -WANDER_FAR_CURIOSITY_RELIEF,
        });
        break;
      case "seek-user":
        // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
        // all seek positioning. Planning only promotes the intent.
        setPetSteering(components, id, "arrive");
        break;
      case "request-jump": {
        const jumpState = components.getComponent(id, "JumpActionState");
        if (!jumpState) {
          components.setComponent(id, {
            type: "JumpActionState",
            phase: "requested",
            cooldownMs: 0,
          });
        }
        // Jump has no arrival event, so intent stays "idle".
        adjustDrive(components, id, { energy: -JUMP_ENERGY_COST });
        break;
      }
      case "request-climb":
        // Both climb fields are set together by the decision system; guard so a
        // malformed token skips materialization rather than climbing to nowhere.
        if (token.climbSurfaceId != null && token.climbTargetY != null) {
          components.setComponent(id, {
            type: "ClimbIntentState",
            phase: "approaching",
            surfaceEntityId: token.climbSurfaceId,
            targetY: token.climbTargetY,
            startedAt: token.decidedAt,
          });
          setPetSteering(components, id, "pursue");
          // Climbing costs energy and resolves curiosity, same as wander-far.
          adjustDrive(components, id, {
            energy: -CLIMB_ENERGY_COST,
            curiosity: -CLIMB_CURIOSITY_RELIEF,
          });
        }
        break;
      case "idle-stay":
        // Intentional no-op: intent stays idle, target stays null.
        break;
      case "work-focus":
      case "work-review":
        setPetSteering(components, id, "stand");
        clearMotionTarget(components, id);
        break;
      case "play-romp": {
        const durationMs = token.activityDurationMs ?? ROMP_BASE_MS;
        components.setComponent(id, {
          type: "RompState",
          startedAt: token.decidedAt,
          endsAt: token.decidedAt + durationMs,
          // First hop fires on the next RompProgressSystem pass.
          nextHopAt: token.decidedAt,
        });
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "romp",
          mood: "excited",
          emote: "sparkle",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + ROMP_END_CUE_MS,
        });
        break;
      }
      case "play-feint": {
        const durationMs = token.activityDurationMs ?? FEINT_BASE_MS;
        if (token.targetEntityId != null) {
          components.setComponent(id, {
            type: "FeintState",
            phase: "approach",
            targetEntityId: token.targetEntityId,
            startedAt: token.decidedAt,
            turnsAt: token.decidedAt + FEINT_APPROACH_MS,
            endsAt: token.decidedAt + durationMs,
          });
        }
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: token.targetEntityId ?? null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "signature",
          mood: "thinking",
          emote: "question",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + FEINT_APPROACH_MS,
        });
        break;
      }
      case "withdraw": {
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "signature",
          mood: "thinking",
          emote: "none",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + (token.activityDurationMs ?? WITHDRAW_DURATION_MS),
        });
        break;
      }
      case "strut": {
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
          speedFactor: STRUT_SPEED_FACTOR,
        });
        setPetSteering(components, id, "pursue");
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "signature",
          mood: "excited",
          emote: "sparkle",
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + STRUT_DURATION_MS,
        });
        adjustDrive(components, id, { energy: -0.05 });
        break;
      }
      // Expressive idle poses — stand still and hold a gesture. No motion; the
      // sustained autonomous claim (set in the decision) drives the sprite row.
      // The mood/emote cue and any drive relief run here.
      case "greet":
      case "groom":
      case "observe":
      case "beckon":
      case "fret":
      case "nap":
      case "meditate":
      case "keep-watch":
      case "peek":
      case "inspect":
      case "follow-routine":
      case "offer-comfort":
      case "stand-lookout":
      // Second signature poses share the stationary materialization path.
      case "caper":
      case "check-in":
      case "hide-away":
      case "explore-nook":
      case "tidy-up":
      case "posture":
      case "nurture":
      case "scheme":
      case "lounge":
      case "center":
      case "preen":
      case "startle-scan":
      case "appraise": {
        setPetSteering(components, id, "stand");
        clearMotionTarget(components, id);
        const cue = EXPRESSIVE_POSE_CUES[token.kind];
        const durationMs = token.activityDurationMs ?? EXPRESSIVE_POSE_DURATIONS[token.kind].base;
        components.setComponent(id, {
          type: "PetExpressionState",
          source: "expressive",
          mood: cue.mood,
          emote: cue.emote,
          label: null,
          startedAt: token.decidedAt,
          expiresAt: token.decidedAt + durationMs,
        });
        if (token.kind === "greet") {
          // A hello meets a little of the need for company.
          adjustDrive(components, id, { social: -0.15 });
        } else if (token.kind === "groom") {
          // A calm tidy-up is mildly restful.
          adjustDrive(components, id, { energy: 0.1 });
        } else if (token.kind === "observe") {
          // Examining the surroundings scratches the novelty itch.
          adjustDrive(components, id, { curiosity: -0.3 });
        } else if (token.kind === "nap") {
          adjustDrive(components, id, { energy: 0.3 });
          recordPetExperience(components, id, "rested", token.decidedAt);
        } else if (token.kind === "meditate") {
          adjustDrive(components, id, { energy: 0.1 });
          recordPetExperience(components, id, "self-soothed", token.decidedAt);
        } else if (token.kind === "keep-watch") {
          adjustDrive(components, id, { social: -0.2 });
        } else if (token.kind === "peek") {
          adjustDrive(components, id, { curiosity: -0.15 });
        } else if (token.kind === "inspect") {
          adjustDrive(components, id, { curiosity: -0.35 });
        } else if (token.kind === "follow-routine") {
          adjustDrive(components, id, { energy: 0.08 });
        } else if (token.kind === "offer-comfort") {
          adjustDrive(components, id, { social: -0.2 });
        } else if (token.kind === "caper") {
          // Bouncing about burns a little energy but scratches the play itch.
          adjustDrive(components, id, { energy: -0.05 });
        } else if (token.kind === "check-in") {
          adjustDrive(components, id, { social: -0.15 });
        } else if (token.kind === "hide-away") {
          adjustDrive(components, id, { curiosity: -0.1 });
        } else if (token.kind === "explore-nook") {
          adjustDrive(components, id, { curiosity: -0.3 });
        } else if (token.kind === "tidy-up") {
          adjustDrive(components, id, { energy: 0.08 });
        } else if (token.kind === "posture") {
          adjustDrive(components, id, { energy: -0.05 });
        } else if (token.kind === "nurture") {
          adjustDrive(components, id, { social: -0.2 });
        } else if (token.kind === "scheme") {
          adjustDrive(components, id, { curiosity: -0.1 });
        } else if (token.kind === "lounge") {
          adjustDrive(components, id, { energy: 0.2 });
        } else if (token.kind === "center") {
          adjustDrive(components, id, { energy: 0.1 });
        } else if (token.kind === "preen") {
          adjustDrive(components, id, { energy: 0.05 });
        } else if (token.kind === "appraise") {
          adjustDrive(components, id, { curiosity: -0.2 });
        }
        break;
      }
      // Phase 3 — social movements.
      case "approach-pet":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: token.targetEntityId ?? null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      case "flee-from-pet":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      // Cursor play — chase the user-anchor entity, which now tracks the
      // live cursor position (see CursorInputSystem).
      case "chase-cursor":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: token.targetEntityId ?? null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        break;
      // Phase 4 — collision reactions (position pre-computed in Decision)
      // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough into the shared collision-reaction materialization below.
      case "collision-engage":
        // Engaging with the other pet is a partial, friendlier social fix
        // than a full approach-pet-success catch.
        adjustDrive(components, id, {
          social: -COLLISION_ENGAGE_SOCIAL_REFILL,
        });
      case "collision-flee":
      case "collision-avoid":
      case "collision-jump":
      case "collision-stay":
      case "collision-unfazed":
        if (token.kind === "collision-jump" && !components.getComponent(id, "JumpActionState")) {
          components.setComponent(id, {
            type: "JumpActionState",
            phase: "requested",
            cooldownMs: 0,
          });
        }
        if (token.targetPosition) {
          components.setComponent(id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: token.targetPosition,
          });
          setPetSteering(components, id, "pursue");
        } else if (token.kind === "collision-stay") {
          components.setComponent(id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: null,
          });
          setPetSteering(components, id, "stand");
        }
        break;
    }
    token.consumed = true;
  });
}
