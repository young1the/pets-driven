import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  FEINT_RETREAT_BODY_WIDTHS,
  ROMP_END_CUE_MS,
  ROMP_HOP_ENERGY_COST,
  ROMP_HOP_INTERVAL_BASE_MS,
  ROMP_HOP_INTERVAL_JITTER_MS,
  ROMP_HOP_RANGE_MAX_BODY_WIDTHS,
  ROMP_HOP_RANGE_MIN_BODY_WIDTHS,
  ROMP_SPEED_FACTOR,
} from "@pets-driven/pet-engine/features/behavior/activity-tuning";
import {
  adjustDrive,
  arrivalDwellMs,
  claim,
  clearMotionTarget,
  isClaimedBySameOrHigherPriority,
  MAKE_ROOM_REASON,
  setPetSteering,
} from "@pets-driven/pet-engine/features/behavior/claim";
import { ARRIVAL_DWELL_REASON } from "@pets-driven/pet-engine/features/behavior/components";
import { isAutonomousRepeatCoolingDown } from "@pets-driven/pet-engine/features/behavior/decision-candidates";
import {
  COLLISION_TARGET_MARGIN,
  clampToBoundsX,
  DEFAULT_BEHAVIOR_BODY_WIDTH,
  fallbackHorizontalDirection,
  petWidth,
} from "@pets-driven/pet-engine/features/behavior/geometry";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Systems that advance an activity already decided and planned: the romp and
 * feint choreographies tick toward their end time, and the personal-space
 * shuffle nudges apart pets that ended the frame stacked. All three run late
 * in BEHAVIOR, after the decision and planning systems.
 */

// Personal space — a cosmetic "make-room" shuffle. Since pets are physical
// ghosts to each other (they pass through freely), two idle pets can settle on
// the exact same spot and render stacked. When that happens a grounded walker
// takes one small step aside — a low-stakes autonomous Decision that sets a
// motion target, not a separation force, so it can never reintroduce the
// grinding/trembling that came from solid bodies. It only fires when a pet is
// genuinely idle and unclaimed, so it never interrupts a session, chase, or
// reaction.
// Trigger only on real stacking: centers within this fraction of a body width.
const PERSONAL_SPACE_TRIGGER_BODY_FRACTION = 0.55;
// How far aside to step, in body widths.
const PERSONAL_SPACE_STEP_BODY_WIDTHS = 1.1;
// A casual shuffle, not a dash.
const PERSONAL_SPACE_SPEED_FACTOR = 0.5;
// Claim lifetime for the shuffle (locomotion persists past it until arrival).
const MAKE_ROOM_CLAIM_MS = 1_200;
// Skip if clamping to bounds leaves less than this much room (pet against a
// wall): stepping into a wall would just micro-oscillate in the walk deadband.
const PERSONAL_SPACE_MIN_ROOM_PX = 12;

// Personal-space "make-room" shuffle. Runs at the end of BEHAVIOR, so it only
// sees pets that ended this frame genuinely idle and unclaimed. A grounded
// walker stacked on top of another pet steps one body-width aside (a motion
// target, handed to Steering — never a force), then settles via the normal
// arrival + dwell path. See MAKE_ROOM_REASON for why this exists.
export function runPersonalSpaceSystem(
  components: ComponentStore,
  clock: Clock,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(
    ["PetCollision", "Steering", "MotionTarget", "Transform", "PetIdentity"],
    (id, [collision, intent, motion, transform]) => {
      if (intent.mode !== "stand") return;
      if (motion.targetPosition !== null || motion.targetEntityId !== null) {
        return;
      }
      // Ground walkers only; flyers/climbers overlapping reads fine as-is.
      if (!components.getComponent(id, "WalkingTag")) return;
      if (components.getComponent(id, "FlyingTag")) return;
      if (components.getComponent(id, "ClimbingTag")) return;
      const contact = components.getComponent(id, "ContactState");
      if (contact && !contact.grounded) return;
      // A pending startle is about to react (or greet) — don't pre-empt it.
      if (components.getComponent(id, "PendingReaction")) return;
      // Any live claim (session, chase, reaction, user hold, even a rest dwell)
      // owns the pet: leave it be. autonomous is the lowest rank, so this is
      // true whenever *any* claim is still live.
      if (isClaimedBySameOrHigherPriority(components, id, "autonomous", now)) {
        return;
      }
      if (isAutonomousRepeatCoolingDown(components, id, MAKE_ROOM_REASON, now)) {
        return;
      }

      const body = components.getComponent(id, "PhysicsBody");
      const width = body?.width ?? DEFAULT_BEHAVIOR_BODY_WIDTH;
      const otherX =
        components.getComponent(collision.otherEntityId, "Transform")?.position.x ??
        collision.otherPosition.x;
      const dx = transform.position.x - otherX;
      // Only real stacking, not incidental edge contact.
      if (Math.abs(dx) > width * PERSONAL_SPACE_TRIGGER_BODY_FRACTION) return;

      const direction =
        Math.abs(dx) > width * 0.15
          ? Math.sign(dx)
          : fallbackHorizontalDirection(id, collision.otherEntityId);
      const targetX = clampToBoundsX(
        transform.position.x + direction * width * PERSONAL_SPACE_STEP_BODY_WIDTHS,
        bounds,
        COLLISION_TARGET_MARGIN,
      );
      // Against a wall with nowhere to go — better to stay stacked than to
      // grind into the boundary.
      if (Math.abs(targetX - transform.position.x) < PERSONAL_SPACE_MIN_ROOM_PX) {
        return;
      }

      components.setComponent(id, {
        type: "MotionTarget",
        targetEntityId: null,
        targetPosition: { x: targetX, y: transform.position.y },
        speedFactor: PERSONAL_SPACE_SPEED_FACTOR,
      });
      intent.mode = "pursue";
      claim(components, id, "autonomous", now, MAKE_ROOM_REASON, now + MAKE_ROOM_CLAIM_MS);
    },
  );
}

// ── RompProgressSystem ─────────────────────────────────────────────────────
//
// Advances a live play-romp: every ROMP_HOP_INTERVAL the pet picks a short
// dash target and jumps toward it, until RompState.endsAt. A higher-priority
// claim (collision, user, social) taking the pet over cancels the romp
// quietly — the interrupter owns the pet's motion from that point.

export function runRompProgressSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(["RompState", "Transform"], (id, [romp, transform]) => {
    const decision = components.getComponent(id, "BehaviorDecisionState");
    // Ownership is by source+reason, not expiry: the romp claim expires at the
    // same instant the romp ends, so an expiry check here would make the
    // graceful-end branch below unreachable. A higher-priority interrupter
    // *overwrites* source/reason, which is what actually revokes ownership.
    if (decision?.source !== "autonomous" || decision.reason !== "play-romp") {
      components.removeComponent(id, "RompState");
      return;
    }

    if (now >= romp.endsAt || decision.expiresAt <= now) {
      components.removeComponent(id, "RompState");
      clearMotionTarget(components, id);
      components.setComponent(id, { type: "Steering", mode: "stand" });
      // A worn-out pet catches its breath before the next decision, with a
      // brief contented cue. (The dwell claim carries the play-romp history
      // forward, so its repeat-cooldown survives the breather.)
      const personality = components.getComponent(id, "Personality");
      if (personality) {
        claim(
          components,
          id,
          "autonomous",
          now,
          ARRIVAL_DWELL_REASON,
          now + arrivalDwellMs(personality, random),
        );
      } else {
        decision.expiresAt = now;
      }
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "romp",
        mood: "happy",
        emote: "sparkle",
        label: null,
        startedAt: now,
        expiresAt: now + ROMP_END_CUE_MS,
      });
      return;
    }

    if (now < romp.nextHopAt) return;
    const contact = components.getComponent(id, "ContactState");
    if (contact && !contact.grounded) return;
    if (components.getComponent(id, "JumpActionState")) return;

    const width = petWidth(components, id);
    const range =
      width *
      (ROMP_HOP_RANGE_MIN_BODY_WIDTHS +
        random.next() * (ROMP_HOP_RANGE_MAX_BODY_WIDTHS - ROMP_HOP_RANGE_MIN_BODY_WIDTHS));
    const direction = random.next() < 0.5 ? -1 : 1;
    components.setComponent(id, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: {
        x: clampToBoundsX(
          transform.position.x + direction * range,
          bounds,
          COLLISION_TARGET_MARGIN,
        ),
        y: transform.position.y,
      },
      speedFactor: ROMP_SPEED_FACTOR,
    });
    components.setComponent(id, { type: "Steering", mode: "pursue" });
    if (components.getComponent(id, "CanJump")) {
      components.setComponent(id, {
        type: "JumpActionState",
        phase: "requested",
        cooldownMs: 0,
      });
    }
    adjustDrive(components, id, { energy: -ROMP_HOP_ENERGY_COST });
    romp.nextHopAt = now + ROMP_HOP_INTERVAL_BASE_MS + random.next() * ROMP_HOP_INTERVAL_JITTER_MS;
  });
}

/** Advance the mischievous approach-then-retreat signature choreography. */
export function runFeintProgressSystem(
  components: ComponentStore,
  clock: Clock,
  bounds: { x?: number; y?: number; width: number; height: number },
): void {
  const now = clock.now();

  components.forEach(["FeintState", "Transform"], (id, [feint, transform]) => {
    const decision = components.getComponent(id, "BehaviorDecisionState");
    if (decision?.source !== "autonomous" || decision.reason !== "play-feint") {
      components.removeComponent(id, "FeintState");
      return;
    }

    if (now >= feint.endsAt || decision.expiresAt <= now) {
      components.removeComponent(id, "FeintState");
      clearMotionTarget(components, id);
      setPetSteering(components, id, "stand");
      decision.expiresAt = now;
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "signature",
        mood: "happy",
        emote: "sparkle",
        label: null,
        startedAt: now,
        expiresAt: now + ROMP_END_CUE_MS,
      });
      recordPetExperience(components, id, "played", now);
      return;
    }

    const target = components.getComponent(feint.targetEntityId, "Transform");
    if (feint.phase === "approach" && now < feint.turnsAt) {
      if (target) {
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: feint.targetEntityId,
          targetPosition: { ...target.position },
          speedFactor: 0.8,
        });
        setPetSteering(components, id, "pursue");
      }
      return;
    }

    if (feint.phase === "approach") {
      const targetX = target?.position.x ?? transform.position.x;
      const fallbackDirection = id < feint.targetEntityId ? -1 : 1;
      const direction =
        Math.abs(transform.position.x - targetX) < 1
          ? fallbackDirection
          : Math.sign(transform.position.x - targetX);
      feint.phase = "retreat";
      components.setComponent(id, {
        type: "MotionTarget",
        targetEntityId: null,
        targetPosition: {
          x: clampToBoundsX(
            transform.position.x + direction * petWidth(components, id) * FEINT_RETREAT_BODY_WIDTHS,
            bounds,
            COLLISION_TARGET_MARGIN,
          ),
          y: transform.position.y,
        },
        speedFactor: 1.2,
      });
      setPetSteering(components, id, "pursue");
      components.setComponent(id, {
        type: "PetExpressionState",
        source: "signature",
        mood: "excited",
        emote: "exclaim",
        label: null,
        startedAt: now,
        expiresAt: feint.endsAt,
      });
    }
  });
}
