import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  claim,
  isClaimed,
  isClaimedBySameOrHigherPriority,
} from "@pets-driven/pet-engine/features/behavior/claim";
import type {
  PendingReactionComponent,
  PersonalityComponent,
  PetExpressionEmote,
  PetExpressionMood,
  ReactionSource,
} from "@pets-driven/pet-engine/features/behavior/components";
import {
  clamp,
  fallbackHorizontalDirection,
} from "@pets-driven/pet-engine/features/behavior/geometry";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Priority-3 collision behavior: turning an overlap into a personality-shaped
 * reaction, and the pair-cooldown memory that stops the same two pets from
 * re-startling each other. The score and direction helpers below are exported
 * because BehaviorDecisionSystem resolves the reaction once its deliberation
 * latency elapses.
 */

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

// Phase 4: collision reaction constants
export const PET_ENGAGE_STOP_WIDTH_MULTIPLIER = 2.5;

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

export function scoreCollisionFlee(p: PersonalityComponent): number {
  // N → flee instinct; A → reduce (agreeable pets less likely to flee)
  return 0.2 + p.neuroticism * 0.7 - p.agreeableness * 0.5;
}

export function scoreCollisionEngage(p: PersonalityComponent): number {
  // E + A → curiosity/warmth; N → avoidance
  return 0.2 + p.extraversion * 0.5 + p.agreeableness * 0.5 - p.neuroticism * 0.4;
}

export function scoreCollisionAvoid(): number {
  // Always a neutral fallback — perpendicular sidestep
  return 0.4;
}

export function scoreCollisionJump(p: PersonalityComponent): number {
  return 1.2 + p.extraversion * 0.45 + p.openness * 0.25 + p.neuroticism * 0.15;
}

export function scoreCollisionStay(p: PersonalityComponent): number {
  // A + calm introversion → comfortable staying close without re-approaching.
  return 0.05 + p.agreeableness * 0.3 + (1 - p.extraversion) * 1 + (1 - p.neuroticism) * 0.1;
}

export function scoreCollisionUnfazed(p: PersonalityComponent): number {
  // Low N → composure; high N → less likely to shrug it off
  return 0.15 + (1 - p.neuroticism) * 0.4;
}

export function constrainCollisionDirectionForLocomotion(
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

export function isHorizontalOnlyCollisionResponse(components: ComponentStore, id: string): boolean {
  return (
    !!components.getComponent(id, "WalkingTag") &&
    !components.getComponent(id, "FlyingTag") &&
    !components.getComponent(id, "ClimbingTag")
  );
}

export function isPendingReactionStillOverlapping(
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
