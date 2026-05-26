import type { ComponentStore } from "@/core/component-store";
import type { SimulationSystem } from "@/core/simulation-system";
import type { WorldStepContext } from "@/core/world-step-context";
import type { Vector } from "@/features/physics/components";
import type { Stimulus } from "@/features/stimulus/stimulus";
import type { Clock } from "@/shared/time/manual-clock";
import type { RandomSource } from "@/shared/random/seeded-random";
import {
  BEHAVIOR_PRIORITY,
  type BehaviorDecisionKind,
  type BehaviorDecisionSource,
  type BehaviorDecisionTokenComponent,
  type PendingReactionComponent,
  type PersonalityComponent,
  type ReactionSource,
  type PetIntent,
} from "./components";

const COLLISION_REACTION_DISTANCE = 96;
const COLLISION_TARGET_MARGIN = 48;
const USER_PROXIMITY_RADIUS = 96;

const AUTONOMOUS_REPEAT_COOLDOWN_MS: Record<string, number> = {
  "wander-near": 750,
  "wander-far": 750,
  "seek-user": 4_000,
  "request-jump": 2_500,
  "request-climb": 6_000,
  "idle-stay": 1_500,
  // Phase 3
  "approach-pet": 1_500,
  "flee-from-pet": 2_000,
  // Phase 4 — collision reactions share the collision claim window
  "collision-flee": 750,
  "collision-engage": 1_500,
  "collision-avoid": 750,
  "collision-unfazed": 500,
};

// Phase 3: social interaction distances
const PET_FLEE_DISTANCE = 200; // px — how far to run from a nearby pet
const PET_APPROACH_STOP_DISTANCE = 80; // px — when approaching, stop this far from the other pet's centre

// Phase 4: collision reaction constants
const PET_ENGAGE_STOP_DISTANCE = 80; // px — stop this far from the other pet's centre

// Duration of each claim in milliseconds
const CLAIM_DURATION_MS: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 2000,
  "agent-event": 5000,
  "collision": 1000,
  "autonomous": 500,
};

function isClaimed(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
): boolean {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  if (!existing) return false;
  if (existing.expiresAt <= now) return false;
  return BEHAVIOR_PRIORITY[existing.source] < BEHAVIOR_PRIORITY[source];
}

function isClaimedBySameOrHigherPriority(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
): boolean {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  if (!existing) return false;
  if (existing.expiresAt <= now) return false;
  return BEHAVIOR_PRIORITY[existing.source] <= BEHAVIOR_PRIORITY[source];
}

function claim(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
  reason: string,
  customExpiresAt?: number,
): void {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  // When a higher-priority (non-autonomous) source overwrites an autonomous
  // claim, carry the autonomous history forward so repeat-cooldowns survive.
  const lastAutonomousReason =
    source === "autonomous" ? reason
    : existing?.source === "autonomous" ? existing.reason
    : (existing?.lastAutonomousReason ?? null);
  const lastAutonomousAt =
    source === "autonomous" ? now
    : existing?.source === "autonomous" ? existing.decidedAt
    : (existing?.lastAutonomousAt ?? null);

  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source,
    decidedAt: now,
    expiresAt: customExpiresAt ?? now + CLAIM_DURATION_MS[source],
    reason,
    lastAutonomousReason,
    lastAutonomousAt,
  });
}

// Priority 1: User interaction (touch, click, drag).
// No external input mechanism yet — placeholder for future pointer events.
export function runUserInteractionBehaviorSystem(
  _components: ComponentStore,
  _clock: Clock,
): void {}

// Priority 2: Agent event reactions (task.started, task.waiting, etc.)
export function runAgentEventBehaviorSystem(
  components: ComponentStore,
  stimuli: Stimulus[],
  clock: Clock,
): void {
  if (stimuli.length === 0) return;
  const now = clock.now();

  components.forEach(
    ["AgentBinding", "IntentState", "SpeechProfile", "SpeechState", "ActivityState", "CompletionBehavior"],
    (id, [agent, intent, speechProfile, speech, activity, completionBehavior]) => {
      if (isClaimed(components, id, "agent-event", now)) return;

      for (const stimulus of stimuli) {
        if (agent.sourceId !== stimulus.sourceId) continue;

        if (stimulus.type === "task.started") {
          intent.intent = "active";
          speech.speech = stimulus.summary ?? speechProfile.taskStarted;
          activity.lastActiveAt = stimulus.at;
          claim(components, id, "agent-event", now, "task.started");
        }

        if (stimulus.type === "task.waiting" || stimulus.type === "attention.requested") {
          intent.intent = "seek";
          speech.speech = stimulus.summary ?? speechProfile.attentionNeeded;
          claim(components, id, "agent-event", now, stimulus.type);
        }

        if (stimulus.type === "task.completed") {
          intent.intent = completionBehavior.intentAfterCompletion;
          speech.speech = stimulus.summary ?? speechProfile.taskCompleted;
          activity.lastActiveAt = stimulus.at;
          claim(components, id, "agent-event", now, "task.completed");
        }
      }
    },
  );
}

// Priority 3: Collision avoidance (entity overlap).
export function runCollisionBehaviorSystem(
  components: ComponentStore,
  bounds: { width: number; height: number },
  clock: Clock,
): void {
  const now = clock.now();

  type Collidable = {
    id: string;
    x: number;
    y: number;
    halfW: number;
    halfH: number;
    intent: string;
    targetX: number | null;
    targetY: number | null;
    motion: { targetEntityId: string | null; targetPosition: { x: number; y: number } | null };
  };

  const entities: Collidable[] = [];
  components.forEach(
    ["Transform", "PhysicsBody", "IntentState", "MotionTarget"],
    (id, [transform, body, intent, motion]) => {
      entities.push({
        id,
        x: transform.position.x,
        y: transform.position.y,
        halfW: body.width / 2,
        halfH: body.height / 2,
        intent: intent.intent,
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
    if (!existing || existing.source !== "collision" || existing.expiresAt <= now) continue;

    const stillOverlapping = entities.some(
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
    if (isClaimedBySameOrHigherPriority(components, entity.id, "collision", now)) continue;
    // Skip if a reaction is already pending (avoid overwriting mid-deliberation).
    if (components.getComponent(entity.id, "PendingReaction")) continue;

    const collision = entities.find(
      (c) =>
        c.id !== entity.id &&
        Math.abs(c.x - entity.x) < entity.halfW + c.halfW &&
        Math.abs(c.y - entity.y) < entity.halfH + c.halfH,
    );
    if (!collision) continue;

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

    // Freeze the pet immediately: clear existing MotionTarget and reset intent
    // to idle so locomotion systems see no active goal and the pet stops.
    // Without this, a pet heading toward its approach-pet target keeps flying
    // into the collider throughout the deliberation window.
    components.setComponent(entity.id, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    components.setComponent(entity.id, { type: "IntentState", intent: "idle" });

    // Hold the claim until reactsAt so BehaviorDecisionSystem skips this pet
    // during the deliberation window.
    claim(components, entity.id, "collision", now, "entity overlap", reactsAt);
  }
}

// ── Phase 4: Reaction latency ─────────────────────────────────────────────
//
// High N (anxiety) → longer freeze before reacting.
// High E (extraversion) → snappier reaction.
// Clamped to 0..2000 ms.

function reactionLatencyMs(p: PersonalityComponent, source: ReactionSource): number {
  const baseMs = source === "collision" ? 400 : source === "stimulus" ? 250 : 200;
  const latency = baseMs * (1 + p.neuroticism * 1.5 - p.extraversion * 0.5);
  return Math.max(0, Math.min(2000, latency));
}

// ── Phase 4: Collision response score functions ───────────────────────────

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

function scoreCollisionUnfazed(p: PersonalityComponent): number {
  // Low N → composure; high N → less likely to shrug it off
  return 0.15 + (1 - p.neuroticism) * 0.4;
}

// Priority 4: Autonomous idle behaviors (speech, wandering).
export function runAutonomousBehaviorSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  const now = clock.now();

  // Idle conversation — only when no higher-priority claim holds
  components.forEach(
    ["IdleConversation", "SpeechProfile", "SpeechState", "ActivityState"],
    (id, [idleConversation, speechProfile, speech, activity]) => {
      if (isClaimed(components, id, "autonomous", now)) return;
      if (speech.speech) return;
      if (clock.now() - activity.lastActiveAt >= idleConversation.idleAfterMs) {
        speech.speech = speechProfile.idleCompanion;
        claim(components, id, "autonomous", now, "idle conversation");
      }
    },
  );
}

// Arrival detection (runs in UPDATE phase, after locomotion decisions).
// Not a BEHAVIOR-phase system: it detects arrival at any target regardless of
// which source directed the pet there.
export function runArrivalBehaviorSystem(components: ComponentStore): void {
  components.forEach(
    ["IntentState", "Transform", "MotionTarget", "WandersOnArrival"],
    (id, [intent, transform, motion, wandersOnArrival]) => {
      if (motion.targetEntityId) {
        if (intent.intent !== "seek") return;
        const perception = components.getComponent(id, "Perception");
        const anchor = perception?.userAnchor;
        if (!anchor) return;
        // Flying pets can close the gap in both axes; walking pets are locked to
        // the ground and can only reduce horizontal distance — use |dx| so arrival
        // fires as soon as the walk system stops (they share the same threshold).
        const dx = anchor.position.x - transform.position.x;
        const dy = anchor.position.y - transform.position.y;
        const isFlying = !!components.getComponent(id, "FlyingTag");
        const dist = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
        if (dist > wandersOnArrival.arrivalRadius) return;
        intent.intent = "idle";
        motion.targetEntityId = null;
        motion.targetPosition = null;
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

      if (delta > wandersOnArrival.arrivalRadius) return;
      motion.targetEntityId = null;
      motion.targetPosition = null;
      intent.intent = "idle";
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
): Candidate {
  const T = T_BASE * (1 + ALPHA_T * neuroticism);
  // Subtract max before exp() to prevent overflow when future phases add
  // high-magnitude scores (approach-pet, flee, collision response, etc.).
  const maxScore = Math.max(...candidates.map((c) => c.score));
  const weights = candidates.map((c) => Math.exp((c.score - maxScore) / T));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = random.next() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1]; // floating-point safety
}

// ── BehaviorDecisionSystem helpers ────────────────────────────────────────

type TokenFields = Omit<BehaviorDecisionTokenComponent, "type" | "decidedAt" | "consumed" | "kind">;

type Candidate = {
  kind: BehaviorDecisionKind;
  score: number;
  build(): TokenFields;
};

function pushCandidate(
  candidates: Candidate[],
  components: ComponentStore,
  id: string,
  now: number,
  candidate: Candidate,
): void {
  if (isAutonomousRepeatCoolingDown(components, id, candidate.kind, now)) return;
  candidates.push(candidate);
}

function isAutonomousRepeatCoolingDown(
  components: ComponentStore,
  id: string,
  reason: string,
  now: number,
): boolean {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (!decision) return false;

  // Use the most recent autonomous decision, whether it is the current claim
  // (source === "autonomous") or was carried over when a higher-priority claim
  // (collision, agent-event) overwrote it.
  const lastReason =
    decision.source === "autonomous" ? decision.reason : decision.lastAutonomousReason;
  const lastAt =
    decision.source === "autonomous" ? decision.decidedAt : decision.lastAutonomousAt;

  if (lastReason !== reason || lastAt == null) return false;

  const cooldownMs = AUTONOMOUS_REPEAT_COOLDOWN_MS[reason] ?? 0;
  return now - lastAt < cooldownMs;
}

// ── OCEAN score functions ────────────────────────────────────────────────────
// Each reads only PersonalityComponent axes; comments name the driving axes.

function scoreWanderNear(p: PersonalityComponent): number {
  // N (neuroticism) → wary, prefers short local moves; O (openness) → slight boost
  return 0.3 + p.openness * 0.1 + p.neuroticism * 0.4;
}

function scoreWanderFar(p: PersonalityComponent): number {
  // O (openness) → exploration drive; N (neuroticism) → reluctance to venture far
  return 0.3 + p.openness * 0.7 - p.neuroticism * 0.2;
}

function scoreSeekUser(p: PersonalityComponent): number {
  // E (extraversion) + A (agreeableness) → approach user; N → avoidance
  return 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.3 - p.neuroticism * 0.3;
}

function scoreJump(p: PersonalityComponent): number {
  // E (extraversion) → action energy; O (openness) → novelty seeking
  return 0.2 + p.extraversion * 0.4 + p.openness * 0.3;
}

function scoreClimb(p: PersonalityComponent): number {
  // O (openness) → exploration; E (extraversion) → physical energy
  return 0.2 + p.openness * 0.6 + p.extraversion * 0.2;
}

function scoreIdleStay(p: PersonalityComponent): number {
  // Low E → reduced need for activity; N (neuroticism) → cautious stillness
  return 0.25 + (1 - p.extraversion) * 0.3 + p.neuroticism * 0.2;
}

// Phase 3 — social interaction score functions (require Perception.nearbyPets)

function scoreApproachPet(p: PersonalityComponent): number {
  // E + A → social draw; N → reluctance
  return 0.3 + p.extraversion * 0.7 + p.agreeableness * 0.4 - p.neuroticism * 0.3;
}

function scoreFleeFromPet(p: PersonalityComponent): number {
  // N → flight instinct; A → reduces urge to flee
  return 0.1 + p.neuroticism * 0.7 - p.agreeableness * 0.4;
}

/**
 * Personality-modulated wander radii.
 * "near": high N → tighter range but still meaningfully visible movement.
 *         Previous range [60..140 → 80..80] left high-N pets making
 *         imperceptible "wanders" of 80 px in a fixed direction. The new
 *         range guarantees a window of at least 40 px even at N=1.
 * "far":  high O → wider exploration range.
 * Exported for unit testing.
 */
export function wanderRadius(
  p: PersonalityComponent,
  range: "near" | "far",
): [number, number] {
  if (range === "near") {
    return [100 + p.neuroticism * 40, 220 - p.neuroticism * 40];
  } else {
    return [200 + p.openness * 100, 400 + p.openness * 200];
  }
}

function pickWanderPosition(
  petX: number,
  petY: number,
  bounds: { width: number; height: number },
  random: RandomSource,
  range: "near" | "far",
  personality?: PersonalityComponent,
): { x: number; y: number } {
  const margin = 48;
  const angle = random.next() * Math.PI * 2;
  const [minR, maxR] = personality
    ? wanderRadius(personality, range)
    : range === "near"
      ? [60, 140]
      : [200, 400];
  const radius = minR + random.next() * (maxR - minR);
  return {
    x: clamp(petX + Math.cos(angle) * radius, margin, bounds.width - margin),
    y: clamp(petY + Math.sin(angle) * radius, margin, bounds.height - margin),
  };
}

function setPetIntent(components: ComponentStore, id: string, intent: PetIntent): void {
  components.setComponent(id, { type: "IntentState", intent });
}

function isNearUserAnchor(
  userAnchor: { x: number; y: number } | null,
  petX: number,
  petY: number,
  isFlying: boolean,
): boolean {
  if (!userAnchor) return false;
  const dx = userAnchor.x - petX;
  const dy = userAnchor.y - petY;
  const distance = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);
  return distance <= USER_PROXIMITY_RADIUS;
}

// ── BehaviorDecisionSystem (priority 4: autonomous) ──────────────────────
//
// Trigger: no active claim AND intent === "idle" AND no motion target.
// Scores all candidates using OCEAN Personality weights, then samples a winner
// via softmax (temperature scales with neuroticism: high N → flatter distribution).
// Emits a BehaviorDecisionToken and claims the entity with source="autonomous".
// Does NOT mutate MotionTarget / IntentState / JumpActionState / ClimbIntentState —
// that is the responsibility of BehaviorPlanningSystem.

export function runBehaviorDecisionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { width: number; height: number },
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
    ["IntentState", "MotionTarget", "Transform", "Personality"],
    (id, [intent, motion, transform, personality]) => {
      // Trigger conditions — only fire for pets that have no active goal.
      // "active" = pursuing a wander/climb target  "seek" = pursuing user
      // Both set a motion target; arrival resets intent back to "idle".
      // "idle" is the only state that means "ready for a new decision".
      if (intent.intent !== "idle") return;
      if (motion.targetPosition !== null) return;
      if (motion.targetEntityId !== null) return;

      // Block if any active claim exists (same- and higher-priority guard).
      const existingClaim = components.getComponent(id, "BehaviorDecisionState");
      if (existingClaim && existingClaim.expiresAt > now) return;

      // If the pet is already committed to approaching a climb surface, don't
      // emit a new autonomous decision — that would change intent and allow
      // MotionTargetSystem (seek) to overwrite ClimbApproachSystem's target.
      const climbIntent = components.getComponent(id, "ClimbIntentState");
      if (climbIntent?.phase === "approaching") return;

      const petX = transform.position.x;
      const petY = transform.position.y;

      // Phase 4: PendingReaction present → claim just expired at reactsAt.
      // Route to the personality-shaped reactive candidate pool instead of
      // the normal autonomous pool.
      const pendingReaction = components.getComponent(id, "PendingReaction");
      if (pendingReaction) {
        const otherPos = pendingReaction.context.otherPosition ?? { x: petX + 100, y: petY };
        const away = normalize({ x: petX - otherPos.x, y: petY - otherPos.y });
        const side = { x: -away.y, y: away.x };

        const fleeTarget = {
          x: clamp(petX + away.x * COLLISION_REACTION_DISTANCE, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
          y: clamp(petY + away.y * COLLISION_REACTION_DISTANCE, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
        };
        // engageTarget sits 80 px from the other pet on SELF's side — close
        // enough to "engage" but not so close that the pet walks straight
        // through. `away` points from other to self, so adding (not subtracting)
        // it to otherPos keeps the target between the two pets. The earlier
        // `otherPos - away * D` placed the target on the FAR side, causing pets
        // to walk through each other and immediately re-collide (cluster bug).
        const engageTarget = {
          x: clamp(otherPos.x + away.x * PET_ENGAGE_STOP_DISTANCE, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
          y: clamp(otherPos.y + away.y * PET_ENGAGE_STOP_DISTANCE, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
        };
        const avoidTarget = {
          x: clamp(petX + side.x * COLLISION_REACTION_DISTANCE, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
          y: clamp(petY + side.y * COLLISION_REACTION_DISTANCE, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
        };
        const reactiveCandidates: Candidate[] = [
          { kind: "collision-flee",    score: scoreCollisionFlee(personality),    build: () => ({ targetPosition: fleeTarget }) },
          { kind: "collision-engage",  score: scoreCollisionEngage(personality),  build: () => ({ targetPosition: engageTarget }) },
          { kind: "collision-avoid",   score: scoreCollisionAvoid(),              build: () => ({ targetPosition: avoidTarget }) },
          // unfazedTarget is computed lazily in build() so random is consumed only
          // if this candidate wins, keeping the softmax r-draw at position 1.
          //
          // NOTE: plan specified "re-emit previous goal" (copy MotionTarget before
          // collision disrupted it). Current implementation picks a fresh wander-near
          // position instead — intentional simplification. The visual result is similar
          // ("stays nearby") but the pet doesn't resume its original trajectory.
          // Restore-previous-goal semantics deferred to Phase 6 visual review.
          { kind: "collision-unfazed", score: scoreCollisionUnfazed(personality), build: () => ({ targetPosition: pickWanderPosition(petX, petY, bounds, random, "near", personality) }) },
        ];

        const reactionWinner = softmaxSample(reactiveCandidates, personality.neuroticism, random);
        components.setComponent(id, {
          type: "BehaviorDecisionToken",
          kind: reactionWinner.kind,
          decidedAt: now,
          consumed: false,
          ...reactionWinner.build(),
        });
        claim(components, id, "autonomous", now, reactionWinner.kind);
        components.removeComponent(id, "PendingReaction");
        return;
      }

      // Read world context from this pet's Perception snapshot.
      const perception = components.getComponent(id, "Perception");
      const perceptionAnchor = perception?.userAnchor;
      const userAnchor: { id: string; x: number; y: number } | null = perceptionAnchor
        ? { id: perceptionAnchor.id, x: perceptionAnchor.position.x, y: perceptionAnchor.position.y }
        : null;

      const isFlying = !!components.getComponent(id, "FlyingTag");

      const candidates: Candidate[] = [];

      pushCandidate(candidates, components, id, now, {
        kind: "wander-near",
        score: scoreWanderNear(personality),
        build: () => ({ targetPosition: pickWanderPosition(petX, petY, bounds, random, "near", personality) }),
      });

      pushCandidate(candidates, components, id, now, {
        kind: "wander-far",
        score: scoreWanderFar(personality),
        build: () => ({ targetPosition: pickWanderPosition(petX, petY, bounds, random, "far", personality) }),
      });

      if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
        pushCandidate(candidates, components, id, now, {
          kind: "seek-user",
          score: scoreSeekUser(personality),
          // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
          // seek positioning; Planning only needs to promote intent to "seek".
          build: () => ({}),
        });
      }

      const canJump = components.getComponent(id, "CanJump");
      const jumpState = components.getComponent(id, "JumpActionState");
      const contact = components.getComponent(id, "ContactState");
      if (canJump && jumpState?.phase === "ready" && (!contact || contact.grounded)) {
        pushCandidate(candidates, components, id, now, {
          kind: "request-jump",
          score: scoreJump(personality),
          // Jump is a one-shot action; Planning reads JumpActionState directly.
          build: () => ({}),
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
            ? { id: nearestClimbable.id, x: nearestClimbable.position.x, y: nearestClimbable.position.y }
            : null;
        if (surface) {
          pushCandidate(candidates, components, id, now, {
            kind: "request-climb",
            score: scoreClimb(personality),
            build: () => {
              // Reserve the surface so later entities in this same pass won't
              // double-target it (build() runs before the next entity is processed).
              claimedSurfaces.add(surface.id);
              return { climbSurfaceId: surface.id, climbTargetY: surface.y - 80 };
            },
          });
        }
      }

      // Phase 3: social candidates — only when another pet is within perception range.
      const nearbyPets = perception?.nearbyPets ?? [];
      if (nearbyPets.length > 0) {
        const nearestPet = nearbyPets[0];

        // approach-pet: only meaningful when the pet is meaningfully farther than
        // the social stop distance. Otherwise the two pets are already in personal
        // space and "approaching" would either collapse into a collision (target =
        // other's centre) or oscillate around the stop distance. Excluding this
        // candidate when close lets wander / idle pick up and the pair drift apart
        // naturally.
        if (nearestPet.distance > PET_APPROACH_STOP_DISTANCE) {
          // Walk toward the other pet but stop PET_APPROACH_STOP_DISTANCE short.
          // Same formula as collision-engage: otherPos + (self→other unit)·D.
          const towardSelfDirX = petX - nearestPet.position.x;
          const towardSelfDirY = petY - nearestPet.position.y;
          const towardSelfLen = Math.hypot(towardSelfDirX, towardSelfDirY) || 1;
          const approachPos = {
            x: clamp(nearestPet.position.x + (towardSelfDirX / towardSelfLen) * PET_APPROACH_STOP_DISTANCE, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
            y: clamp(nearestPet.position.y + (towardSelfDirY / towardSelfLen) * PET_APPROACH_STOP_DISTANCE, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
          };
          pushCandidate(candidates, components, id, now, {
            kind: "approach-pet",
            score: scoreApproachPet(personality),
            // Planning sets MotionTarget to the snapshot position (not entity-tracked).
            build: () => ({
              targetEntityId: nearestPet.id,
              targetPosition: approachPos,
            }),
          });
        }

        const fleeDirX = petX - nearestPet.position.x;
        const fleeDirY = petY - nearestPet.position.y;
        const fleeLen = Math.hypot(fleeDirX, fleeDirY) || 1;
        const fleePos = {
          x: clamp(petX + (fleeDirX / fleeLen) * PET_FLEE_DISTANCE, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
          y: clamp(petY + (fleeDirY / fleeLen) * PET_FLEE_DISTANCE, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
        };
        pushCandidate(candidates, components, id, now, {
          kind: "flee-from-pet",
          score: scoreFleeFromPet(personality),
          build: () => ({ targetPosition: fleePos }),
        });
      }

      pushCandidate(candidates, components, id, now, {
        kind: "idle-stay",
        score: scoreIdleStay(personality),
        build: () => ({}),
      });

      if (candidates.length === 0) return;
      // Softmax sampling: temperature scales with neuroticism.
      // High N → higher T → flatter distribution → more erratic behaviour.
      const winner = softmaxSample(candidates, personality.neuroticism, random);
      components.setComponent(id, {
        type: "BehaviorDecisionToken",
        kind: winner.kind,
        decidedAt: now,
        consumed: false,
        ...winner.build(),
      });
      claim(components, id, "autonomous", now, winner.kind);
    },
  );
}

// ── BehaviorPlanningSystem ────────────────────────────────────────────────
//
// Runs at end of BEHAVIOR phase, after BehaviorDecisionSystem.
// Reads the unconsumed BehaviorDecisionToken and materializes it into
// concrete state components (MotionTarget, IntentState, JumpActionState,
// ClimbIntentState). Marks the token consumed when done.

export function runBehaviorPlanningSystem(
  components: ComponentStore,
  _clock: Clock,
): void {
  components.forEach(["BehaviorDecisionToken"], (id, [token]) => {
    if (token.consumed) return;
    switch (token.kind) {
      case "wander-near":
      case "wander-far":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition!,
        });
        setPetIntent(components, id, "active");
        break;
      case "seek-user":
        // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
        // all seek positioning. Planning only promotes the intent.
        setPetIntent(components, id, "seek");
        break;
      case "request-jump": {
        const jumpState = components.getComponent(id, "JumpActionState");
        if (jumpState) {
          components.setComponent(id, {
            type: "JumpActionState",
            phase: "requested",
            cooldownMs: jumpState.cooldownMs,
          });
        }
        // Jump has no arrival event, so intent stays "idle".
        break;
      }
      case "request-climb":
        components.setComponent(id, {
          type: "ClimbIntentState",
          phase: "approaching",
          surfaceEntityId: token.climbSurfaceId!,
          targetY: token.climbTargetY!,
        });
        setPetIntent(components, id, "active");
        break;
      case "idle-stay":
        // Intentional no-op: intent stays idle, target stays null.
        break;
      // Phase 3 — social movements (position snapshot; not entity-tracked)
      case "approach-pet":
      case "flee-from-pet":
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition!,
        });
        setPetIntent(components, id, "active");
        break;
      // Phase 4 — collision reactions (position pre-computed in Decision)
      case "collision-flee":
      case "collision-engage":
      case "collision-avoid":
      case "collision-unfazed":
        if (token.targetPosition) {
          components.setComponent(id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: token.targetPosition,
          });
          setPetIntent(components, id, "active");
        }
        break;
    }
    token.consumed = true;
  });
}

function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ── System descriptors ─────────────────────────────────────────────────────

export const UserInteractionBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "UserInteractionBehaviorSystem",
  dependsOn: ["ContactSystem"],
  reads: [],
  writes: ["BehaviorDecisionState"],
  update(ctx) {
    runUserInteractionBehaviorSystem(ctx.components, ctx.clock);
  },
};

export const AgentEventBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "AgentEventBehaviorSystem",
  dependsOn: ["UserInteractionBehaviorSystem"],
  reads: ["AgentBinding", "IntentState", "SpeechProfile", "SpeechState", "ActivityState", "CompletionBehavior"],
  writes: ["IntentState", "SpeechState", "ActivityState", "BehaviorDecisionState"],
  update(ctx) {
    runAgentEventBehaviorSystem(ctx.components, ctx.stimuli.drain(), ctx.clock);
  },
};

export const CollisionBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "CollisionBehaviorSystem",
  dependsOn: ["AgentEventBehaviorSystem"],
  reads: ["Transform", "PhysicsBody", "IntentState", "MotionTarget", "Personality"],
  writes: ["PendingReaction", "BehaviorDecisionState"],
  update(ctx) {
    runCollisionBehaviorSystem(ctx.components, ctx.bounds, ctx.clock);
  },
};

export const BehaviorDecisionSystem: SimulationSystem<WorldStepContext> = {
  name: "BehaviorDecisionSystem",
  dependsOn: ["CollisionBehaviorSystem"],
  reads: [
    "IntentState",
    "MotionTarget",
    "Transform",
    "Personality",
    "Perception",
    "PendingReaction",
    "CanJump",
    "JumpActionState",
    "CanWallClimb",
  ],
  writes: [
    "BehaviorDecisionToken",
    "BehaviorDecisionState",
    "PendingReaction",
  ],
  update(ctx) {
    runBehaviorDecisionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};

export const BehaviorPlanningSystem: SimulationSystem<WorldStepContext> = {
  name: "BehaviorPlanningSystem",
  dependsOn: ["AutonomousBehaviorSystem"],
  reads: ["BehaviorDecisionToken", "JumpActionState"],
  writes: [
    "IntentState",
    "MotionTarget",
    "JumpActionState",
    "ClimbIntentState",
    "BehaviorDecisionToken",
  ],
  update(ctx) {
    runBehaviorPlanningSystem(ctx.components, ctx.clock);
  },
};

export const AutonomousBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "AutonomousBehaviorSystem",
  dependsOn: ["BehaviorDecisionSystem"],
  reads: ["IdleConversation", "SpeechProfile", "SpeechState", "ActivityState"],
  writes: ["SpeechState", "BehaviorDecisionState"],
  update(ctx) {
    runAutonomousBehaviorSystem(ctx.components, ctx.clock);
  },
};

export const ArrivalBehaviorSystem: SimulationSystem<WorldStepContext> = {
  name: "ArrivalBehaviorSystem",
  dependsOn: ["ClimbApproachSystem"],
  reads: ["Transform", "MotionTarget", "WandersOnArrival", "IntentState", "ClimbingTag", "Perception", "ClimbIntentState"],
  writes: ["MotionTarget", "IntentState"],
  update(ctx) {
    runArrivalBehaviorSystem(ctx.components);
  },
};
