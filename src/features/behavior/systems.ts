import type { ComponentStore } from "@/core/component-store";
import type { Vector } from "@/features/physics/components";
import type { Stimulus } from "@/features/stimulus/stimulus";
import type { Clock } from "@/shared/time/manual-clock";
import type { RandomSource } from "@/shared/random/seeded-random";
import {
  BEHAVIOR_PRIORITY,
  type BehaviorDecisionSource,
  type BehaviorPreferenceComponent,
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
};

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
    expiresAt: now + CLAIM_DURATION_MS[source],
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

  components.query(
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
  components.query(
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

  for (const entity of entities) {
    // Do not disrupt a climbing entity — the WallClimbSystem drives position
    // via the Y component of motionTarget, so overwriting it with a 2-D
    // avoidance vector would send the pet to an unintended height.
    if (components.getComponent(entity.id, "ClimbingState")) continue;
    if (isClaimedBySameOrHigherPriority(components, entity.id, "collision", now)) continue;

    const collision = entities.find(
      (c) =>
        c.id !== entity.id &&
        Math.abs(c.x - entity.x) < entity.halfW + c.halfW &&
        Math.abs(c.y - entity.y) < entity.halfH + c.halfH,
    );
    if (!collision) continue;

    const away = normalize({ x: entity.x - collision.x, y: entity.y - collision.y });
    let dir: Vector;

    if (entity.intent === "idle") {
      dir = away;
    } else if (entity.intent === "active") {
      const side = normalize({ x: -away.y, y: away.x });
      dir = normalize({ x: away.x + side.x, y: away.y + side.y });
    } else {
      const targetDir =
        entity.targetX !== null && entity.targetY !== null
          ? normalize({ x: entity.targetX - entity.x, y: entity.targetY - entity.y })
          : away;
      const side = normalize({ x: -away.y, y: away.x });
      dir = normalize({ x: targetDir.x + side.x, y: targetDir.y + side.y });
    }

    entity.motion.targetEntityId = null;
    entity.motion.targetPosition = {
      x: clamp(entity.x + dir.x * COLLISION_REACTION_DISTANCE, COLLISION_TARGET_MARGIN, bounds.width - COLLISION_TARGET_MARGIN),
      y: clamp(entity.y + dir.y * COLLISION_REACTION_DISTANCE, COLLISION_TARGET_MARGIN, bounds.height - COLLISION_TARGET_MARGIN),
    };

    claim(components, entity.id, "collision", now, "entity overlap");
  }
}

// Priority 4: Autonomous idle behaviors (speech, wandering).
export function runAutonomousBehaviorSystem(
  components: ComponentStore,
  clock: Clock,
): void {
  const now = clock.now();

  // Idle conversation — only when no higher-priority claim holds
  components.query(
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
  type AnchorEntry = { id: string; x: number; y: number };
  const anchors: AnchorEntry[] = [];

  components.query(["UserAnchor", "Transform"], (id, [, transform]) => {
    anchors.push({ id, x: transform.position.x, y: transform.position.y });
  });

  components.query(
    ["IntentState", "Transform", "MotionTarget", "WandersOnArrival"],
    (id, [intent, transform, motion, wandersOnArrival]) => {
      if (motion.targetEntityId) {
        if (intent.intent !== "seek") return;
        const anchor = anchors.find((a) => a.id === motion.targetEntityId);
        if (!anchor) return;
        // Flying pets can close the gap in both axes; walking pets are locked to
        // the ground and can only reduce horizontal distance — use |dx| so arrival
        // fires as soon as the walk system stops (they share the same threshold).
        const dx = anchor.x - transform.position.x;
        const dy = anchor.y - transform.position.y;
        const isFlying = !!components.getComponent(id, "FlyingState");
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

      const climbing = components.getComponent(id, "ClimbingState");
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

// ── BehaviorSelectionSystem helpers ───────────────────────────────────────

type ApplyCtx = {
  components: ComponentStore;
  id: string;
  petX: number;
  petY: number;
  bounds: { width: number; height: number };
  random: RandomSource;
  userAnchor: { id: string; x: number; y: number } | null;
};

type Candidate = {
  reason: string;
  score: number;
  apply(ctx: ApplyCtx): void;
};

function pushCandidate(
  candidates: Candidate[],
  components: ComponentStore,
  id: string,
  now: number,
  candidate: Candidate,
): void {
  if (isAutonomousRepeatCoolingDown(components, id, candidate.reason, now)) return;
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

function scoreWanderNear(pref: BehaviorPreferenceComponent): number {
  return 0.3 + pref.curiosity * 0.3 + pref.shyness * 0.4;
}

function scoreWanderFar(pref: BehaviorPreferenceComponent): number {
  return 0.3 + pref.curiosity * 0.7;
}

function scoreSeekUser(pref: BehaviorPreferenceComponent): number {
  return 0.3 + pref.sociability * 0.9 - pref.shyness * 0.4;
}

function scoreJump(pref: BehaviorPreferenceComponent): number {
  return 0.2 + pref.playfulness * 0.6;
}

function scoreClimb(pref: BehaviorPreferenceComponent): number {
  return 0.2 + pref.playfulness * 0.7 + pref.curiosity * 0.2;
}

function scoreIdleStay(pref: BehaviorPreferenceComponent): number {
  return 0.25 + pref.shyness * 0.5;
}

function pickWanderPosition(
  ctx: ApplyCtx,
  range: "near" | "far",
): { x: number; y: number } {
  const margin = 48;
  const angle = ctx.random.next() * Math.PI * 2;
  const radius =
    range === "near"
      ? 60 + ctx.random.next() * 80   // 60–140 px
      : 200 + ctx.random.next() * 200; // 200–400 px
  return {
    x: clamp(ctx.petX + Math.cos(angle) * radius, margin, ctx.bounds.width - margin),
    y: clamp(ctx.petY + Math.sin(angle) * radius, margin, ctx.bounds.height - margin),
  };
}

function setIntent(ctx: ApplyCtx, intent: PetIntent): void {
  ctx.components.setComponent(ctx.id, { type: "IntentState", intent });
}

function isNearUserAnchor(ctx: ApplyCtx): boolean {
  if (!ctx.userAnchor) return false;

  const dx = ctx.userAnchor.x - ctx.petX;
  const dy = ctx.userAnchor.y - ctx.petY;
  const isFlying = !!ctx.components.getComponent(ctx.id, "FlyingState");
  const distance = isFlying ? Math.hypot(dx, dy) : Math.abs(dx);

  return distance <= USER_PROXIMITY_RADIUS;
}

function nearestClimbableSurface(
  components: ComponentStore,
  ctx: ApplyCtx,
): { id: string; x: number; y: number } | null {
  const candidates: Array<{ id: string; x: number; y: number; dist: number }> = [];
  components.query(["ClimbableSurface", "Transform"], (id, [, transform]) => {
    const dx = transform.position.x - ctx.petX;
    const dy = transform.position.y - ctx.petY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 400) {
      candidates.push({ id, x: transform.position.x, y: transform.position.y, dist });
    }
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  const nearest = candidates[0];
  return { id: nearest.id, x: nearest.x, y: nearest.y };
}

// ── BehaviorSelectionSystem (priority 4: autonomous) ─────────────────────
//
// Trigger: no active claim AND intent !== "seek" AND no motion target.
// Scores all candidates using BehaviorPreference weights + seeded random jitter,
// then commits the winner via IntentState / MotionTarget / JumpActionState /
// ClimbIntentState and claims the entity with source="autonomous".

export function runBehaviorSelectionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { width: number; height: number },
): void {
  const now = clock.now();

  // Resolve user anchor once for the whole pass.
  let userAnchor: { id: string; x: number; y: number } | null = null;
  components.query(["UserAnchor", "Transform"], (id, [, transform]) => {
    if (!userAnchor) {
      userAnchor = { id, x: transform.position.x, y: transform.position.y };
    }
  });

  // One pet per climbable surface at a time.  Pre-populate from entities that
  // are already approaching or actively climbing.  Updated inside apply() so
  // sequential entity passes in the same step also see fresh reservations.
  const claimedSurfaces = new Set<string>();
  components.query(["ClimbIntentState"], (otherId, [otherIntent]) => {
    if (otherIntent.phase === "approaching") {
      claimedSurfaces.add(otherIntent.surfaceEntityId);
      return;
    }
    if (otherIntent.phase === "attached" && components.getComponent(otherId, "ClimbingState")) {
      claimedSurfaces.add(otherIntent.surfaceEntityId);
    }
  });

  components.query(
    ["IntentState", "MotionTarget", "Transform", "BehaviorPreference"],
    (id, [intent, motion, transform, pref]) => {
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

      const ctx: ApplyCtx = {
        components,
        id,
        petX: transform.position.x,
        petY: transform.position.y,
        bounds,
        random,
        userAnchor,
      };

      const candidates: Candidate[] = [];

      pushCandidate(candidates, components, id, now, {
        reason: "wander-near",
        score: scoreWanderNear(pref) + random.next() * 0.05,
        apply: (c) => {
          c.components.setComponent(c.id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: pickWanderPosition(c, "near"),
          });
          setIntent(c, "active");
        },
      });

      pushCandidate(candidates, components, id, now, {
        reason: "wander-far",
        score: scoreWanderFar(pref) + random.next() * 0.05,
        apply: (c) => {
          c.components.setComponent(c.id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: pickWanderPosition(c, "far"),
          });
          setIntent(c, "active");
        },
      });

      if (userAnchor && !isNearUserAnchor(ctx)) {
        pushCandidate(candidates, components, id, now, {
          reason: "seek-user",
          score: scoreSeekUser(pref) + random.next() * 0.05,
          apply: (c) => {
            if (!c.userAnchor) return;
            c.components.setComponent(c.id, {
              type: "MotionTarget",
              targetEntityId: c.userAnchor.id,
              targetPosition: { x: c.userAnchor.x, y: c.userAnchor.y },
            });
            setIntent(c, "seek");
          },
        });
      }

      const canJump = components.getComponent(id, "CanJump");
      const jumpState = components.getComponent(id, "JumpActionState");
      const contact = components.getComponent(id, "ContactState");
      if (canJump && jumpState?.phase === "ready" && (!contact || contact.grounded)) {
        pushCandidate(candidates, components, id, now, {
          reason: "request-jump",
          score: scoreJump(pref) + random.next() * 0.05,
          apply: (c) => {
            c.components.setComponent(c.id, {
              type: "JumpActionState",
              phase: "requested",
              cooldownMs: jumpState.cooldownMs,
            });
            // Jump is a one-shot action with no arrival event, so intent stays
            // "idle". BehaviorSelectionSystem re-fires after the claim expires.
          },
        });
      }

      const canClimb = components.getComponent(id, "CanWallClimb");
      const climbing = components.getComponent(id, "ClimbingState");
      const climbDismount = components.getComponent(id, "ClimbDismountState");
      if (canClimb && !climbing && (!climbDismount || climbDismount.phase === "ready")) {
        const surface = nearestClimbableSurface(components, ctx);
        // Only push the candidate when no other entity has reserved this surface.
        if (surface && !claimedSurfaces.has(surface.id)) {
          pushCandidate(candidates, components, id, now, {
            reason: "request-climb",
            score: scoreClimb(pref) + random.next() * 0.05,
            apply: (c) => {
              // Reserve the surface so later entities in this same pass won't
              // double-target it (apply() runs before the next entity is processed).
              claimedSurfaces.add(surface.id);
              c.components.setComponent(c.id, {
                type: "ClimbIntentState",
                phase: "approaching",
                surfaceEntityId: surface.id,
                targetY: surface.y - 80,
              });
              setIntent(c, "active");
            },
          });
        }
      }

      pushCandidate(candidates, components, id, now, {
        reason: "idle-stay",
        score: scoreIdleStay(pref) + random.next() * 0.05,
        apply: () => {
          // Intentional no-op: intent stays idle, target stays null.
        },
      });

      if (candidates.length === 0) return;
      const winner = candidates.reduce((best, c) => (c.score > best.score ? c : best));
      winner.apply(ctx);
      claim(components, id, "autonomous", now, winner.reason);
    },
  );
}

function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
