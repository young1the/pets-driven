import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  CHASE_PROP_SPEED_FACTOR,
  EXPRESSIVE_POSE_CUES,
  EXPRESSIVE_POSE_DURATIONS,
  FEINT_APPROACH_MS,
  FEINT_BASE_MS,
  JUMP_ENERGY_COST,
  ROMP_BASE_MS,
  ROMP_END_CUE_MS,
  STRUT_DURATION_MS,
  STRUT_SPEED_FACTOR,
  WITHDRAW_DURATION_MS,
} from "@pets-driven/pet-engine/features/behavior/activity-tuning";
import {
  adjustDrive,
  clearMotionTarget,
  setPetSteering,
} from "@pets-driven/pet-engine/features/behavior/claim";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * BehaviorPlanningSystem: the one place a decision token becomes concrete
 * state. Everything upstream of it decides *what* the pet does; this decides
 * which components carry that out.
 */

// ── Drives satisfaction hooks ────────────────────────────────────────────
// Magnitudes on the same 0..1 scale as DrivesComponent fields. "Substantial"
// refills (catching a pet) are larger than "partial" ones (a friendly
// collision reaction); costs are small enough that a pet needs several
// jumps/climbs before it visibly tires. The jump cost itself is in
// `activity-tuning.ts`, where the romp hop derives from it.
const COLLISION_ENGAGE_SOCIAL_REFILL = 0.15;
const WANDER_FAR_CURIOSITY_RELIEF = 0.35;
const CLIMB_CURIOSITY_RELIEF = 0.3;
const CLIMB_ENERGY_COST = 0.12;
const FETCH_ITEM_CURIOSITY_RELIEF = 0.25;
// Smaller than fetch-item's: setting off after the ball is only half the
// business, and PropKickSystem pays the rest out on contact.
const CHASE_PROP_CURIOSITY_RELIEF = 0.12;

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
      case "fetch-item":
        // Walk to where the trinket lies; ItemPickupSystem does the collecting
        // once the pet is standing over it, and ArrivalBehaviorSystem clears
        // the target either way (another pet may get there first).
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
        });
        setPetSteering(components, id, "pursue");
        // Going to look at the strange new thing is itself novelty.
        adjustDrive(components, id, { curiosity: -FETCH_ITEM_CURIOSITY_RELIEF });
        break;
      case "chase-prop":
        // Run at where the ball is now. PropKickSystem does the connecting once
        // the pet gets there, and ArrivalBehaviorSystem clears the target
        // whether or not the ball is still lying there when it arrives.
        components.setComponent(id, {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: token.targetPosition ?? null,
          // Nobody saunters after a ball.
          speedFactor: CHASE_PROP_SPEED_FACTOR,
        });
        setPetSteering(components, id, "pursue");
        // The relief for the chase itself is deliberately small — the kick at
        // the end of it is where PropKickSystem pays out the rest, so a pet that
        // sets off and never arrives does not get the full satisfaction.
        adjustDrive(components, id, { curiosity: -CHASE_PROP_CURIOSITY_RELIEF });
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
