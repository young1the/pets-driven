import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { utteranceChannel } from "@pets-driven/pet-engine/features/agent/components";
import {
  BEHAVIOR_PRIORITY,
  type BehaviorDecisionSource,
  BOOKKEEPING_AUTONOMOUS_REASONS,
  type PersonalityComponent,
  type SteeringMode,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { DrivesComponent } from "@pets-driven/pet-engine/features/drives/components";
import { clampDrive } from "@pets-driven/pet-engine/features/drives/systems";
import type { Vector } from "@pets-driven/pet-engine/features/physics/components";
import { personalityArrivalDwellScale } from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";

/**
 * The claim ladder every behavior system writes through, plus the small set of
 * state writes that go with it (speech, motion target, drive satisfaction).
 * `BEHAVIOR_PRIORITY` decides who may overwrite whom; everything here exists so
 * that decision stays in one place instead of being re-derived per system.
 */

export const SPEECH_BUBBLE_DURATION_MS = 3_000;

/** Claim reason for the cosmetic personal-space shuffle. */
export const MAKE_ROOM_REASON = "make-room";

// Arriving anywhere earns a beat of stillness before the next decision —
// a pet that walks somewhere and immediately walks elsewhere reads as
// aimless pacing. Extraverts dwell briefly; introverts linger.
const ARRIVAL_DWELL_BASE_MS = 700;
const ARRIVAL_DWELL_INTROVERSION_MS = 2_300;
const ARRIVAL_DWELL_JITTER_MS = 1_000;

/** Personality-scaled pause after reaching any destination. */
export function arrivalDwellMs(p: PersonalityComponent, random: RandomSource | undefined): number {
  const jitter = random ? random.next() : 0.5;
  return Math.round(
    (ARRIVAL_DWELL_BASE_MS +
      (1 - p.extraversion) * ARRIVAL_DWELL_INTROVERSION_MS +
      jitter * ARRIVAL_DWELL_JITTER_MS) *
      personalityArrivalDwellScale(p.catalogId),
  );
}

/**
 * Applies a drive delta in place (component objects are mutated directly, same
 * pattern as ContactState/MotionTarget elsewhere in the behavior slice). No-ops
 * when the entity has no Drives component — satisfaction hooks stay optional so
 * pets without Drives are unaffected.
 */
export function adjustDrive(
  components: ComponentStore,
  id: string,
  deltas: Partial<Pick<DrivesComponent, "social" | "energy" | "curiosity">>,
): void {
  const drives = components.getComponent(id, "Drives");
  if (!drives) return;
  if (deltas.social !== undefined) {
    drives.social = clampDrive(drives.social + deltas.social);
  }
  if (deltas.energy !== undefined) {
    drives.energy = clampDrive(drives.energy + deltas.energy);
  }
  if (deltas.curiosity !== undefined) {
    drives.curiosity = clampDrive(drives.curiosity + deltas.curiosity);
  }
}

// Duration of each claim in milliseconds
const CLAIM_DURATION_MS: Record<BehaviorDecisionSource, number> = {
  "user-interaction": 2000,
  "agent-event": 5000,
  collision: 1000,
  // SocialInteractionSystem re-claims each tick while a session runs, so this
  // is only the fallback lifetime for a claim it stops refreshing.
  social: 750,
  autonomous: 500,
};

export function isClaimed(
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

export function isClaimedBySameOrHigherPriority(
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

export function claim(
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
  // Bookkeeping reasons (arrival dwell, idle speech) are not decisions — they
  // also carry history forward instead of becoming the history themselves.
  const recordsNewHistory = source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(reason);
  const existingIsRealAutonomous =
    existing?.source === "autonomous" && !BOOKKEEPING_AUTONOMOUS_REASONS.has(existing.reason);
  const lastAutonomousReason = recordsNewHistory
    ? reason
    : existingIsRealAutonomous
      ? existing.reason
      : (existing?.lastAutonomousReason ?? null);
  const lastAutonomousAt = recordsNewHistory
    ? now
    : existingIsRealAutonomous
      ? existing.decidedAt
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

/** Write a plain spoken line (source "idle") to the pet's channel with a TTL. */
export function setIdleSpeech(
  components: ComponentStore,
  id: string,
  line: string | null,
  now: number,
) {
  components.setComponent(
    id,
    utteranceChannel({ message: line, source: "idle", now, durationMs: SPEECH_BUBBLE_DURATION_MS }),
  );
}

export function clearMotionTarget(components: ComponentStore, id: string): void {
  components.setComponent(id, {
    type: "MotionTarget",
    targetEntityId: null,
    targetPosition: null,
  });
}

export type VelocityWriter = {
  setVelocity(id: string, velocity: Partial<Vector>): void;
};

export function stopPetMovement(
  components: ComponentStore,
  physics: VelocityWriter | undefined,
  id: string,
): void {
  clearMotionTarget(components, id);
  physics?.setVelocity(id, { x: 0, y: 0 });
}

export function setPetSteering(components: ComponentStore, id: string, mode: SteeringMode): void {
  components.setComponent(id, { type: "Steering", mode });
}
