import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { getExpressivePoseState } from "@pets-driven/pet-engine/features/behavior/pose-choreography";
import { isDanceFlourish } from "@pets-driven/pet-engine/features/social/dance";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";

// Per-tick horizontal displacement (engine pixels) above this counts as the pet
// visibly travelling, so it plays a directional running row instead of the
// stationary task-run animation. Empirically, resting pets sit at ~0 dx while
// real walking spends most of its time in the 0.1–3 range and only briefly
// peaks past 0.5 (the ~0.5 median of eased approach used to fall through to the
// in-place "running" row even though the pet was clearly moving). Kept well
// below that walking band, and far above resting noise, so any actual travel
// reads as directional.
const TRAVEL_DISPLACEMENT_THRESHOLD = 0.1;

// Per-tick vertical displacement above this reads as airborne motion (a fall or
// throw the jump/airborne tags did not already flag), keeping the jumping row.
const AIRBORNE_DISPLACEMENT_THRESHOLD = 0.5;

/**
 * The only user-interaction claims allowed to hold an expressive pose.
 *
 * A pose normally belongs to an autonomous claim — a pet standing still because
 * it *chose* to. The acknowledge beat is the exception: the user has just
 * released a settled task, the task hold that was pinning the waiting/review
 * row is gone, and the pet has nothing left to play but `idle`, so the release
 * looked like nothing happened (PET-23). Letting these two reasons resolve a
 * choreography gives the release an actual answer — a wave-off.
 *
 * Kept as an explicit allow-list rather than a blanket `user-interaction` check:
 * dragging, throwing, petting and keyboard control are all user claims too, and
 * none of them should be able to freeze the body into a pose.
 */
const POSED_USER_INTERACTION_REASONS = new Set(["acknowledge-waiting", "acknowledge-completed"]);

function isPosedUserInteraction(decision: { source: string; reason: string }): boolean {
  return (
    decision.source === "user-interaction" && POSED_USER_INTERACTION_REASONS.has(decision.reason)
  );
}

type TravelDirection = "left" | "right";

function getTravelDirection(dx: number): TravelDirection | null {
  if (Math.abs(dx) <= TRAVEL_DISPLACEMENT_THRESHOLD) {
    return null;
  }
  return dx > 0 ? "right" : "left";
}

/**
 * Canonical "intent → sprite row" mapping. Reads the pet's ECS state and picks
 * one of the atlas's animation rows. This is where the vocabulary of pet
 * intents lives: as the behavior surface grows, new intents resolve to a row
 * here, while the rendering layer stays a pure function of the row.
 *
 * `now` is the world clock, used to advance a held expressive pose through its
 * choreography (see pose-choreography.ts). Omitting it pins every pose to its
 * opening beat, which is the pre-choreography behavior.
 */
export function getPetAnimationState(
  componentStore: ComponentStore,
  id: string,
  now = 0,
): PetAnimationState | undefined {
  if (!componentStore.getComponent(id, "PetIdentity")) {
    return undefined;
  }

  // Movement is read from the engine's own per-tick displacement (Transform
  // delta, recorded by TravelTrackingSystem), never the matter.js velocity.
  const travel = componentStore.getComponent(id, "TravelState");
  const dx = travel?.dx ?? 0;
  const dy = travel?.dy ?? 0;

  const agentTask = componentStore.getComponent(id, "AgentTaskState");

  // Status poses (waiting / failed / review) only apply while the pet is
  // actually held. Once the user releases the hold, the reported status
  // stays on the pet but locomotion drives the sprite again.
  if (componentStore.getComponent(id, "TaskMovementHold")) {
    if (agentTask?.status === "failed") return "failed";
    if (agentTask?.status === "completed") return "review";
    if (agentTask?.status === "waiting") return "waiting";

    const decision = componentStore.getComponent(id, "BehaviorDecisionState");
    if (decision?.reason === "task.failed") return "failed";
    if (decision?.reason === "task.completed") return "review";
    if (decision?.reason === "task.waiting" || decision?.reason === "attention.requested") {
      return "waiting";
    }
  }

  const jumpAction = componentStore.getComponent(id, "JumpActionState");
  if (
    jumpAction ||
    componentStore.getComponent(id, "AirborneTag") ||
    Math.abs(dy) > AIRBORNE_DISPLACEMENT_THRESHOLD
  ) {
    return "jumping";
  }

  // System-driven horizontal movement plays the directional travel rows. Read
  // the pet's actual per-tick displacement so every kind of system push —
  // walking toward a target, fleeing, collision recoil, coasting momentum —
  // reads as travel, rather than falling through to the stationary task-run
  // ("running") sprite that does not look like it is moving.
  const travelDirection = getTravelDirection(dx);
  if (travelDirection) {
    return travelDirection === "right" ? "running-right" : "running-left";
  }

  const membership = componentStore.getComponent(id, "SocialSessionMember");
  const socialSession = membership
    ? componentStore.getComponent(membership.sessionId, "SocialSession")
    : undefined;
  if (
    socialSession?.kind === "dance" &&
    socialSession.phase === "play" &&
    socialSession.playStartedAt !== null &&
    isDanceFlourish(now - socialSession.playStartedAt)
  ) {
    return "waving";
  }

  // Sustained expressive poses: the pet is standing still with an autonomous
  // claim naming the gesture. Checked after travel/jump so a moving pet still
  // animates locomotion; a stationary pose wins over the idle fallback. The
  // row advances through the pose's choreography as the claim is held, so two
  // poses sharing an opening row still diverge within the first second.
  const decision = componentStore.getComponent(id, "BehaviorDecisionState");
  const signatureReaction = componentStore.getComponent(id, "SignatureReactionState");
  if (signatureReaction) {
    const pose = getExpressivePoseState(signatureReaction.pose, now - signatureReaction.startedAt);
    if (pose) return pose;
  }
  if (decision && (decision.source === "autonomous" || isPosedUserInteraction(decision))) {
    const pose = getExpressivePoseState(decision.reason, now - decision.decidedAt);
    if (pose) return pose;
  }

  const intent = componentStore.getComponent(id, "Steering");
  if (intent?.mode === "pursue") {
    return "running";
  }

  return agentTask?.status === "working" ? "running" : "idle";
}
