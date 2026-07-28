import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";
import {
  BEHAVIOR_PRIORITY,
  type BehaviorDecisionKind,
  BOOKKEEPING_AUTONOMOUS_REASONS,
  type PersonalityComponent,
  type PetExpressionEmote,
  type PetExpressionMood,
} from "@pets-driven/pet-engine/features/behavior/components";
import { behaviorSignature } from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import type {
  SeenSignatureReaction,
  SignatureReactionKind,
  SignatureReactionStateComponent,
} from "./components";

type Bounds = { x?: number; y?: number; width: number; height: number };
type Vec = { x: number; y: number };

export const SIGNATURE_REACTION_RADIUS = 220;
export const SIGNATURE_REACTION_DURATION_MS = 3_200;
export const MAX_SIGNATURE_RESPONDERS = 2;

const MEMORY_LIMIT = 12;
const DEFAULT_BODY_WIDTH = 32;
const KEEP_DISTANCE_BODY_WIDTHS = 3.5;

const MOVING_SIGNATURE_POSE: Partial<Record<BehaviorDecisionKind, string>> = {
  "play-romp": "caper",
  "play-feint": "scheme",
  strut: "posture",
  withdraw: "preen",
};

const QUIET_SIGNATURES: ReadonlySet<BehaviorDecisionKind> = new Set([
  "nap",
  "lounge",
  "meditate",
  "center",
  "peek",
  "hide-away",
  "preen",
]);

const CARING_SIGNATURES: ReadonlySet<BehaviorDecisionKind> = new Set([
  "keep-watch",
  "check-in",
  "offer-comfort",
  "nurture",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** True only for one of the two catalog-exclusive decisions of this pet. */
export function isPersonalitySignatureDecision(
  personality: PersonalityComponent,
  kind: string,
): kind is BehaviorDecisionKind {
  const signature = behaviorSignature(personality.catalogId);
  return (
    !!signature && (signature.primaryDecision === kind || signature.secondaryDecision === kind)
  );
}

/**
 * Personality-shaped answer weights. The source action decides the pose; the
 * observer's temperament decides whether it joins, cheers, watches, or backs
 * off. Catalog nudges keep the closest OCEAN presets visibly distinct.
 */
export function signatureReactionWeights(
  personality: PersonalityComponent,
): Array<{ kind: SignatureReactionKind; weight: number }> {
  const { openness: o, conscientiousness: c, extraversion: e, agreeableness: a } = personality;
  const n = personality.neuroticism;
  const weights: Record<SignatureReactionKind, number> = {
    join: 0.08 + o * 0.3 + e * 0.5 + a * 0.15 - n * 0.18,
    cheer: 0.08 + e * 0.3 + a * 0.55 - n * 0.08,
    watch: 0.12 + o * 0.45 + c * 0.25 + (1 - e) * 0.2,
    "keep-distance": 0.04 + n * 0.65 + (1 - a) * 0.3 + (1 - e) * 0.1,
  };

  switch (personality.catalogId) {
    case "playful":
    case "mischievous":
      weights.join += 0.6;
      break;
    case "attentive":
    case "gentle":
      weights.cheer += 0.6;
      break;
    case "curious":
    case "steady":
    case "shrewd":
      weights.watch += 0.6;
      break;
    case "reserved":
      weights.watch += 0.35;
      weights["keep-distance"] += 0.3;
      break;
    case "aloof":
    case "skittish":
      weights["keep-distance"] += 0.6;
      break;
    case "lazy":
    case "zen":
      weights.watch += 0.25;
      break;
  }

  return (Object.entries(weights) as Array<[SignatureReactionKind, number]>).map(
    ([kind, weight]) => ({ kind, weight: clamp(weight, 0.02, 2) }),
  );
}

function reactionChance(personality: PersonalityComponent): number {
  return clamp(
    0.35 +
      personality.openness * 0.2 +
      personality.agreeableness * 0.2 +
      personality.extraversion * 0.15 -
      personality.neuroticism * 0.08,
    0.25,
    0.9,
  );
}

function pickReaction(
  personality: PersonalityComponent,
  random: RandomSource,
): SignatureReactionKind {
  const weights = signatureReactionWeights(personality);
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random.next() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return "watch";
}

function hasSeen(
  components: ComponentStore,
  observerId: string,
  sourceId: string,
  sourceDecisionAt: number,
): boolean {
  return (
    components
      .getComponent(observerId, "SignatureReactionMemory")
      ?.entries.some(
        (entry) => entry.sourceId === sourceId && entry.sourceDecisionAt === sourceDecisionAt,
      ) ?? false
  );
}

function remember(
  components: ComponentStore,
  observerId: string,
  entry: SeenSignatureReaction,
): void {
  const existing = components.getComponent(observerId, "SignatureReactionMemory");
  const entries = [...(existing?.entries ?? []), entry].slice(-MEMORY_LIMIT);
  components.setComponent(observerId, { type: "SignatureReactionMemory", entries });
}

function reactedCount(
  components: ComponentStore,
  sourceId: string,
  sourceDecisionAt: number,
): number {
  let count = 0;
  components.forEach(["SignatureReactionMemory"], (_id, [memory]) => {
    count += memory.entries.filter(
      (entry) =>
        entry.reacted && entry.sourceId === sourceId && entry.sourceDecisionAt === sourceDecisionAt,
    ).length;
  });
  return count;
}

function isBlockedByHigherPriority(components: ComponentStore, id: string, now: number): boolean {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  return (
    !!components.getComponent(id, "TaskMovementHold") ||
    (!!decision &&
      decision.expiresAt > now &&
      BEHAVIOR_PRIORITY[decision.source] < BEHAVIOR_PRIORITY.social)
  );
}

function claimReaction(
  components: ComponentStore,
  id: string,
  now: number,
  reason: string,
  expiresAt: number,
): void {
  const existing = components.getComponent(id, "BehaviorDecisionState");
  const existingIsRealAutonomous =
    existing?.source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(existing.reason);
  components.setComponent(id, {
    type: "BehaviorDecisionState",
    source: "social",
    decidedAt: now,
    expiresAt,
    reason,
    lastAutonomousReason: existingIsRealAutonomous
      ? existing.reason
      : (existing?.lastAutonomousReason ?? null),
    lastAutonomousAt: existingIsRealAutonomous
      ? existing.decidedAt
      : (existing?.lastAutonomousAt ?? null),
  });
}

function stop(components: ComponentStore, id: string): void {
  components.setComponent(id, {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: null,
  });
  components.setComponent(id, { type: "Steering", mode: "stand" });
}

function reactionReason(reaction: SignatureReactionKind): string {
  return `signature-reaction-${reaction}`;
}

function sourcePose(sourceKind: BehaviorDecisionKind): string {
  return MOVING_SIGNATURE_POSE[sourceKind] ?? sourceKind;
}

function reactionPose(reaction: SignatureReactionKind, sourceKind: BehaviorDecisionKind): string {
  switch (reaction) {
    case "join":
      return sourcePose(sourceKind);
    case "cheer":
      return "greet";
    case "watch":
      return "observe";
    case "keep-distance":
      return "hide-away";
  }
}

function expressionFor(
  reaction: SignatureReactionKind,
  sourceKind: BehaviorDecisionKind,
): { mood: PetExpressionMood; emote: PetExpressionEmote } {
  if (reaction === "cheer") return { mood: "love", emote: "heart" };
  if (reaction === "watch") return { mood: "thinking", emote: "dots" };
  if (reaction === "keep-distance") return { mood: "confused", emote: "sweat" };
  if (sourceKind === "nap" || sourceKind === "lounge") {
    return { mood: "sleepy", emote: "zzz" };
  }
  if (QUIET_SIGNATURES.has(sourceKind)) return { mood: "happy", emote: "dots" };
  if (CARING_SIGNATURES.has(sourceKind)) return { mood: "love", emote: "heart" };
  return { mood: "excited", emote: "music" };
}

function keepDistanceTarget(
  components: ComponentStore,
  observerId: string,
  observerPosition: Vec,
  sourcePosition: Vec,
  bounds: Bounds,
): Vec {
  const width = components.getComponent(observerId, "PhysicsBody")?.width ?? DEFAULT_BODY_WIDTH;
  const initialDirection = observerPosition.x <= sourcePosition.x ? -1 : 1;
  const distance = width * KEEP_DISTANCE_BODY_WIDTHS;
  const margin = Math.max(48, width / 2);
  const minX = (bounds.x ?? 0) + margin;
  const maxX = (bounds.x ?? 0) + bounds.width - margin;
  const preferredX = clamp(observerPosition.x + initialDirection * distance, minX, maxX);
  const alternateX = clamp(observerPosition.x - initialDirection * distance, minX, maxX);
  return {
    x:
      Math.abs(preferredX - observerPosition.x) >= Math.abs(alternateX - observerPosition.x)
        ? preferredX
        : alternateX,
    y: observerPosition.y,
  };
}

function beginReaction(
  components: ComponentStore,
  observerId: string,
  sourceId: string,
  sourceKind: BehaviorDecisionKind,
  sourceDecisionAt: number,
  reaction: SignatureReactionKind,
  now: number,
  bounds: Bounds,
): void {
  const expiresAt = now + SIGNATURE_REACTION_DURATION_MS;
  const state: SignatureReactionStateComponent = {
    type: "SignatureReactionState",
    sourceId,
    sourceDecisionKind: sourceKind,
    sourceDecisionAt,
    reaction,
    pose: reactionPose(reaction, sourceKind),
    startedAt: now,
    expiresAt,
  };
  components.setComponent(observerId, state);

  // BehaviorDecisionSystem may have emitted a lower-priority autonomous token
  // earlier in this tick. The social reaction supersedes it before planning.
  components.removeComponent(observerId, "BehaviorDecisionToken");
  claimReaction(components, observerId, now, reactionReason(reaction), expiresAt);

  const observerPosition = components.getComponent(observerId, "Transform")?.position;
  const sourcePosition = components.getComponent(sourceId, "Transform")?.position;
  if (reaction === "keep-distance" && observerPosition && sourcePosition) {
    components.setComponent(observerId, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: keepDistanceTarget(
        components,
        observerId,
        observerPosition,
        sourcePosition,
        bounds,
      ),
      speedFactor: 0.65,
    });
    components.setComponent(observerId, { type: "Steering", mode: "pursue" });
  } else {
    stop(components, observerId);
  }

  const expression = expressionFor(reaction, sourceKind);
  components.setComponent(observerId, {
    type: "PetExpressionState",
    source: "signature-reaction",
    mood: expression.mood,
    emote: expression.emote,
    label: null,
    startedAt: now,
    expiresAt,
  });
}

function finishExpiredReactions(components: ComponentStore, now: number): void {
  const activeIds = [...components.components("SignatureReactionState").keys()];
  for (const id of activeIds) {
    const reaction = components.getComponent(id, "SignatureReactionState");
    if (!reaction) continue;
    const sourceDecision = components.getComponent(reaction.sourceId, "BehaviorDecisionState");
    const sourceStillPerforming =
      sourceDecision?.source === "autonomous" &&
      sourceDecision.reason === reaction.sourceDecisionKind &&
      sourceDecision.decidedAt === reaction.sourceDecisionAt &&
      sourceDecision.expiresAt > now;
    const ownClaim = components.getComponent(id, "BehaviorDecisionState");
    const stillOwnsReaction =
      ownClaim?.source === "social" && ownClaim.reason === reactionReason(reaction.reaction);

    if (reaction.expiresAt > now && sourceStillPerforming && stillOwnsReaction) continue;

    components.removeComponent(id, "SignatureReactionState");
    const expression = components.getComponent(id, "PetExpressionState");
    if (expression?.source === "signature-reaction") {
      components.removeComponent(id, "PetExpressionState");
    }
    // A higher-priority owner decides its own movement; only stop a reaction
    // that ended naturally while its social claim was still authoritative.
    if (stillOwnsReaction && !isBlockedByHigherPriority(components, id, now)) {
      stop(components, id);
      ownClaim.expiresAt = now;
    }
  }
}

function eligibleObserver(
  components: ComponentStore,
  id: string,
  sourceId: string,
  sourceDecisionAt: number,
  now: number,
): PersonalityComponent | null {
  if (id === sourceId) return null;
  if (!components.getComponent(id, "CanSocialize")) return null;
  if (components.getComponent(id, "SignatureReactionState")) return null;
  if (components.getComponent(id, "SocialSessionMember")) return null;
  if (components.getComponent(id, "SocialInvite")) return null;
  if (components.getComponent(id, "PendingReaction")) return null;
  if (components.getComponent(id, "AgentTaskState")?.status === "working") return null;
  if (isBlockedByHigherPriority(components, id, now)) return null;
  if (hasSeen(components, id, sourceId, sourceDecisionAt)) return null;
  if (components.getComponent(id, "Steering")?.mode !== "stand") return null;
  const motion = components.getComponent(id, "MotionTarget");
  if (!motion || motion.targetPosition !== null || motion.targetEntityId !== null) return null;

  // Never interrupt a pet that is currently showing its own signature. Other
  // autonomous idles may be superseded because social outranks autonomous.
  const existing = components.getComponent(id, "BehaviorDecisionState");
  const personality = components.getComponent(id, "Personality");
  if (!personality) return null;
  if (
    existing?.source === "autonomous" &&
    existing.expiresAt > now &&
    isPersonalitySignatureDecision(personality, existing.reason)
  ) {
    return null;
  }
  return personality;
}

function emitSignatureReactions(
  components: ComponentStore,
  now: number,
  random: RandomSource,
  bounds: Bounds,
): void {
  const sourceIds = [...components.components("CanSocialize").keys()].sort();
  for (const sourceId of sourceIds) {
    const sourceDecision = components.getComponent(sourceId, "BehaviorDecisionState");
    const sourcePersonality = components.getComponent(sourceId, "Personality");
    const sourcePosition = components.getComponent(sourceId, "Transform")?.position;
    if (!sourceDecision || !sourcePersonality || !sourcePosition) continue;
    if (sourceDecision.source !== "autonomous" || sourceDecision.expiresAt <= now) continue;
    if (!isPersonalitySignatureDecision(sourcePersonality, sourceDecision.reason)) continue;

    let accepted = reactedCount(components, sourceId, sourceDecision.decidedAt);
    if (accepted >= MAX_SIGNATURE_RESPONDERS) continue;

    const candidates: Array<{ id: string; distance: number; personality: PersonalityComponent }> =
      [];
    for (const entity of components.entities()) {
      const personality = eligibleObserver(
        components,
        entity.id,
        sourceId,
        sourceDecision.decidedAt,
        now,
      );
      const position = components.getComponent(entity.id, "Transform")?.position;
      if (!personality || !position) continue;
      const distance = Math.hypot(position.x - sourcePosition.x, position.y - sourcePosition.y);
      if (distance > SIGNATURE_REACTION_RADIUS) continue;
      candidates.push({ id: entity.id, distance, personality });
    }
    candidates.sort(
      (left, right) => left.distance - right.distance || left.id.localeCompare(right.id),
    );

    for (const candidate of candidates) {
      if (accepted >= MAX_SIGNATURE_RESPONDERS) break;
      const reacts = random.next() < reactionChance(candidate.personality);
      remember(components, candidate.id, {
        sourceId,
        sourceDecisionAt: sourceDecision.decidedAt,
        reacted: reacts,
      });
      if (!reacts) continue;
      const reaction = pickReaction(candidate.personality, random);
      beginReaction(
        components,
        candidate.id,
        sourceId,
        sourceDecision.reason,
        sourceDecision.decidedAt,
        reaction,
        now,
        bounds,
      );
      accepted += 1;
    }
  }
}

export function runSignatureReactionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: Bounds,
): void {
  const now = clock.now();
  finishExpiredReactions(components, now);
  emitSignatureReactions(components, now, random, bounds);
}

export const SignatureReactionSystem: SimulationSystem<WorldStepContext> = {
  name: "SignatureReactionSystem",
  dependsOn: ["BehaviorDecisionSystem"],
  reads: [
    "CanSocialize",
    "Personality",
    "Transform",
    "PhysicsBody",
    "Steering",
    "MotionTarget",
    "BehaviorDecisionState",
    "BehaviorDecisionToken",
    "TaskMovementHold",
    "AgentTaskState",
    "PendingReaction",
    "SocialInvite",
    "SocialSessionMember",
    "SignatureReactionState",
    "SignatureReactionMemory",
  ],
  writes: [
    "SignatureReactionState",
    "SignatureReactionMemory",
    "BehaviorDecisionState",
    "BehaviorDecisionToken",
    "MotionTarget",
    "Steering",
    "PetExpressionState",
  ],
  update(ctx) {
    runSignatureReactionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
};
