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

function claim(
  components: ComponentStore,
  id: string,
  source: BehaviorDecisionSource,
  now: number,
  reason: string,
): void {
  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source,
    decidedAt: now,
    expiresAt: now + CLAIM_DURATION_MS[source],
    reason,
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
    if (isClaimed(components, entity.id, "collision", now)) continue;

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
        const dist = Math.hypot(anchor.x - transform.position.x, anchor.y - transform.position.y);
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

function nearestClimbableSurface(
  components: ComponentStore,
  ctx: ApplyCtx,
): { id: string; x: number; y: number } | null {
  let best: { id: string; x: number; y: number; dist: number } | null = null;
  components.query(["ClimbableSurface", "Transform"], (id, [, transform]) => {
    const dx = transform.position.x - ctx.petX;
    const dy = transform.position.y - ctx.petY;
    const dist = Math.hypot(dx, dy);
    if (dist > 400) return;
    if (!best || dist < best.dist) {
      best = { id, x: transform.position.x, y: transform.position.y, dist };
    }
  });
  return best ? { id: best.id, x: best.x, y: best.y } : null;
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

  components.query(
    ["IntentState", "MotionTarget", "Transform", "BehaviorPreference"],
    (id, [intent, motion, transform, pref]) => {
      // Trigger conditions
      if (intent.intent === "seek") return;
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

      candidates.push({
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

      candidates.push({
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

      if (userAnchor) {
        candidates.push({
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
      if (canJump && jumpState?.phase === "ready") {
        candidates.push({
          reason: "request-jump",
          score: scoreJump(pref) + random.next() * 0.05,
          apply: (c) => {
            c.components.setComponent(c.id, {
              type: "JumpActionState",
              phase: "requested",
              cooldownMs: jumpState.cooldownMs,
            });
            setIntent(c, "active");
          },
        });
      }

      const canClimb = components.getComponent(id, "CanWallClimb");
      if (canClimb) {
        const surface = nearestClimbableSurface(components, ctx);
        if (surface) {
          candidates.push({
            reason: "request-climb",
            score: scoreClimb(pref) + random.next() * 0.05,
            apply: (c) => {
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

      candidates.push({
        reason: "idle-stay",
        score: scoreIdleStay(pref) + random.next() * 0.05,
        apply: () => {
          // Intentional no-op: intent stays idle, target stays null.
        },
      });

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
