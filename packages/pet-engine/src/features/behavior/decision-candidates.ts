import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  type BehaviorDecisionKind,
  type BehaviorDecisionSelectionTrace,
  type BehaviorDecisionTokenComponent,
  BOOKKEEPING_AUTONOMOUS_REASONS,
  type PersonalityComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
import {
  clamp,
  DEFAULT_BEHAVIOR_BODY_WIDTH,
} from "@pets-driven/pet-engine/features/behavior/geometry";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import type { MoodStateComponent } from "@pets-driven/pet-engine/features/mood/components";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";

/**
 * Candidate-pool construction for BehaviorDecisionSystem: what may be offered
 * to the softmax at all. Scoring lives in `decision-scores.ts`; the decision
 * itself in `decision-system.ts`.
 */

const USER_PROXIMITY_RADIUS = 96;
const DEFAULT_WANDER_BODY_WIDTH = DEFAULT_BEHAVIOR_BODY_WIDTH;
const WANDER_BASE_BODY_MULTIPLIER = 3;

const AUTONOMOUS_REPEAT_COOLDOWN_MS: Record<string, number> = {
  "wander-near": 750,
  "wander-far": 750,
  "seek-user": 4_000,
  "request-jump": 2_500,
  "request-climb": 6_000,
  // Short: a trinket only exists for a while, and a pet that gave up on one
  // (another pet got there first) should be free to try the next drop.
  "fetch-item": 2_000,
  "idle-stay": 1_500,
  // Phase 3
  "approach-pet": 1_500,
  "flee-from-pet": 2_000,
  // Phase 4 — collision reactions share the collision claim window
  "collision-flee": 750,
  "collision-engage": 1_500,
  "collision-avoid": 750,
  "collision-stay": 1_500,
  "collision-unfazed": 500,
  // Cursor play
  "chase-cursor": 2_000,
  // Sustained solo play — long cooldown so romps stay an occasional treat.
  "play-romp": 8_000,
  // Personal-space shuffle — after stepping aside, wait a while before again.
  "make-room": 4_000,
  // Expressive idle poses — occasional treats, same tier as play-romp so they
  // punctuate ordinary life without spamming.
  greet: 6_000,
  groom: 8_000,
  observe: 8_000,
  beckon: 6_000,
  fret: 8_000,
  nap: 15_000,
  meditate: 12_000,
  "play-feint": 10_000,
  "keep-watch": 10_000,
  peek: 10_000,
  withdraw: 8_000,
  inspect: 10_000,
  "follow-routine": 12_000,
  strut: 10_000,
  "offer-comfort": 10_000,
  "stand-lookout": 8_000,
  // Second signature poses — occasional treats like the first tier.
  caper: 10_000,
  "check-in": 10_000,
  "hide-away": 10_000,
  "explore-nook": 10_000,
  "tidy-up": 10_000,
  posture: 10_000,
  nurture: 10_000,
  scheme: 10_000,
  lounge: 14_000,
  center: 12_000,
  preen: 10_000,
  "startle-scan": 8_000,
  appraise: 10_000,
};

export type TokenFields = Omit<
  BehaviorDecisionTokenComponent,
  "type" | "decidedAt" | "consumed" | "kind"
>;

export type Candidate = {
  kind: BehaviorDecisionKind;
  score: number;
  build(): TokenFields;
};

export function pushCandidate(
  candidates: Candidate[],
  components: ComponentStore,
  id: string,
  now: number,
  candidate: Candidate,
): void {
  if (isAutonomousRepeatCoolingDown(components, id, candidate.kind, now)) return;
  candidates.push(candidate);
}

export function isAutonomousRepeatCoolingDown(
  components: ComponentStore,
  id: string,
  reason: string,
  now: number,
): boolean {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (!decision) return false;

  // Use the most recent autonomous decision, whether it is the current claim
  // (source === "autonomous") or was carried over when a higher-priority
  // claim (collision, agent-event) or a bookkeeping claim overwrote it.
  const isRealAutonomous =
    decision.source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(decision.reason);
  const lastReason = isRealAutonomous ? decision.reason : decision.lastAutonomousReason;
  const lastAt = isRealAutonomous ? decision.decidedAt : decision.lastAutonomousAt;

  if (lastReason !== reason || lastAt == null) return false;

  const cooldownMs = AUTONOMOUS_REPEAT_COOLDOWN_MS[reason] ?? 0;
  return now - lastAt < cooldownMs;
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
  bodyWidth = DEFAULT_WANDER_BODY_WIDTH,
): [number, number] {
  const base = bodyWidth * WANDER_BASE_BODY_MULTIPLIER;
  if (range === "near") {
    return [
      base + p.neuroticism * bodyWidth * 1.25,
      base * 2.25 - p.neuroticism * bodyWidth * 1.25,
    ];
  } else {
    return [base * 2 + p.openness * base, base * 4 + p.openness * base * 2];
  }
}

export function pickWanderPosition(
  petX: number,
  petY: number,
  bounds: { x?: number; y?: number; width: number; height: number },
  random: RandomSource,
  range: "near" | "far",
  personality?: PersonalityComponent,
  bodyWidth = DEFAULT_WANDER_BODY_WIDTH,
): { x: number; y: number } {
  const margin = 48;
  // A wide body cannot centre itself within half its width of a side wall, so a
  // target inside that band is physically unreachable: the walker jams against
  // the wall, never satisfies the horizontal arrival test, never returns to
  // "idle", and so never gets to re-decide (e.g. to jump). Widen the horizontal
  // margin to at least the body's half-width so targets stay reachable. The
  // default 32-wide body's half-width (16) stays under `margin`, so this leaves
  // default-sized pets unchanged.
  const horizontalMargin = Math.max(margin, bodyWidth / 2);
  const minX = (bounds.x ?? 0) + horizontalMargin;
  const minY = (bounds.y ?? 0) + margin;
  const maxX = (bounds.x ?? 0) + bounds.width - horizontalMargin;
  const maxY = (bounds.y ?? 0) + bounds.height - margin;
  const angle = random.next() * Math.PI * 2;
  const [minR, maxR] = personality
    ? wanderRadius(personality, range, bodyWidth)
    : range === "near"
      ? [60, 140]
      : [200, 400];
  const radius = minR + random.next() * (maxR - minR);
  return {
    x: clamp(petX + Math.cos(angle) * radius, minX, maxX),
    y: clamp(petY + Math.sin(angle) * radius, minY, maxY),
  };
}

export function isNearUserAnchor(
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

// ── Softmax sampling ─────────────────────────────────────────────────────
//
// Temperature T = T_BASE * (1 + ALPHA_T * neuroticism):
//   • Low N  (e.g. 0.1) → T ≈ 0.28  → distribution concentrated on top scorer
//   • High N (e.g. 0.9) → T ≈ 0.52  → distribution is more uniform / erratic
//
// A single random.next() call per selection; no per-candidate jitter.

const T_BASE = 0.25;
const ALPHA_T = 1.2;

export function softmaxSample(
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

/**
 * Everything the three decision branches read off the pet before choosing a
 * pool. Assembled once per pet in BehaviorDecisionSystem so a branch takes one
 * argument instead of nine.
 */
export type DecisionContext = {
  components: ComponentStore;
  id: string;
  now: number;
  random: RandomSource;
  bounds: { x?: number; y?: number; width: number; height: number };
  personality: PersonalityComponent;
  petX: number;
  petY: number;
  drives: DrivesComponent | undefined;
  mood: MoodStateComponent | undefined;
};
