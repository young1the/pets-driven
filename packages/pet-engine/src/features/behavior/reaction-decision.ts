import { claim } from "@pets-driven/pet-engine/features/behavior/claim";
import {
  constrainCollisionDirectionForLocomotion,
  isHorizontalOnlyCollisionResponse,
  isPendingReactionStillOverlapping,
  PET_ENGAGE_STOP_WIDTH_MULTIPLIER,
  scoreCollisionAvoid,
  scoreCollisionEngage,
  scoreCollisionFlee,
  scoreCollisionJump,
  scoreCollisionStay,
  scoreCollisionUnfazed,
} from "@pets-driven/pet-engine/features/behavior/collision-systems";
import type { PendingReactionComponent } from "@pets-driven/pet-engine/features/behavior/components";
import {
  type Candidate,
  type DecisionContext,
  pickWanderPosition,
  softmaxSample,
} from "@pets-driven/pet-engine/features/behavior/decision-candidates";
import {
  COLLISION_TARGET_MARGIN,
  clampToBoundsX,
  clampToBoundsY,
  normalize,
  petWidth,
} from "@pets-driven/pet-engine/features/behavior/geometry";
import { moodAdjustedDecisionScore } from "@pets-driven/pet-engine/features/mood/systems";
import { isBumpSocialEligible } from "@pets-driven/pet-engine/features/social/systems";
import { signedDecisionScore } from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";

const COLLISION_REACTION_WIDTH_MULTIPLIER = 6;

/**
 * The reactive candidate pool: a PendingReaction whose deliberation latency has
 * elapsed picks a personality-shaped response to the pet it bumped into,
 * instead of going through the ordinary autonomous pool.
 */
export function decidePendingReaction(
  { components, id, now, random, bounds, personality, petX, petY, mood }: DecisionContext,
  pendingReaction: PendingReactionComponent,
): boolean {
  const otherPos = pendingReaction.context.otherPosition ?? {
    x: petX + 100,
    y: petY,
  };
  const away = normalize({ x: petX - otherPos.x, y: petY - otherPos.y });
  const movementAway = constrainCollisionDirectionForLocomotion(
    components,
    id,
    pendingReaction.context.otherEntityId,
    away,
  );
  const side = isHorizontalOnlyCollisionResponse(components, id)
    ? movementAway
    : { x: -away.y, y: away.x };
  const reactionDistance = petWidth(components, id) * COLLISION_REACTION_WIDTH_MULTIPLIER;
  const engageStopDistance = petWidth(components, id) * PET_ENGAGE_STOP_WIDTH_MULTIPLIER;
  const stillOverlapping = isPendingReactionStillOverlapping(components, id, pendingReaction);
  const canCollisionJump =
    stillOverlapping &&
    !!components.getComponent(id, "CanJump") &&
    !components.getComponent(id, "JumpActionState") &&
    !!components.getComponent(id, "WalkingTag") &&
    !components.getComponent(id, "FlyingTag") &&
    !components.getComponent(id, "ClimbingTag") &&
    (components.getComponent(id, "ContactState")?.grounded ?? true);

  const fleeTarget = {
    x: clampToBoundsX(petX + movementAway.x * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
    y: clampToBoundsY(petY + movementAway.y * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
  };
  // engageTarget sits 80 px from the other pet on SELF's side — close
  // enough to "engage" but not so close that the pet walks straight
  // through. `away` points from other to self, so adding (not subtracting)
  // it to otherPos keeps the target between the two pets. The earlier
  // `otherPos - away * D` placed the target on the FAR side, causing pets
  // to walk through each other and immediately re-collide (cluster bug).
  const engageTarget = {
    x: clampToBoundsX(
      otherPos.x + movementAway.x * engageStopDistance,
      bounds,
      COLLISION_TARGET_MARGIN,
    ),
    y: clampToBoundsY(
      otherPos.y + movementAway.y * engageStopDistance,
      bounds,
      COLLISION_TARGET_MARGIN,
    ),
  };
  const avoidTarget = {
    x: clampToBoundsX(petX + side.x * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
    y: clampToBoundsY(petY + side.y * reactionDistance, bounds, COLLISION_TARGET_MARGIN),
  };
  // B4: for a socializable pair the bump-to-greet conversion (in
  // SocialInteractionSystem, earlier this tick) supersedes the engage
  // reaction — reaching this point means the pet rolled against
  // inviting, so "walk close and stop" would be a mixed signal. Engage
  // stays available toward non-socializable entities.
  const bumpOtherId = pendingReaction.context.otherEntityId;
  const bumpSupersedesEngage =
    !!bumpOtherId && isBumpSocialEligible(components, id, bumpOtherId, now);
  const reactiveCandidates: Candidate[] = [
    {
      kind: "collision-flee",
      score: scoreCollisionFlee(personality),
      build: () => ({ targetPosition: fleeTarget }),
    },
    ...(bumpSupersedesEngage
      ? []
      : [
          {
            kind: "collision-engage" as const,
            score: scoreCollisionEngage(personality),
            build: () => ({ targetPosition: engageTarget }),
          },
        ]),
    {
      kind: "collision-avoid",
      score: scoreCollisionAvoid(),
      build: () => ({ targetPosition: avoidTarget }),
    },
  ];
  if (canCollisionJump) {
    reactiveCandidates.push({
      kind: "collision-jump",
      score: scoreCollisionJump(personality),
      build: () => ({ targetPosition: fleeTarget }),
    });
  }
  if (!stillOverlapping) {
    reactiveCandidates.push({
      kind: "collision-stay",
      score: scoreCollisionStay(personality),
      build: () => ({}),
    });
  }
  reactiveCandidates.push({
    kind: "collision-unfazed",
    score: scoreCollisionUnfazed(personality),
    // unfazedTarget is computed lazily in build() so random is consumed
    // only if this candidate wins, keeping the softmax r-draw stable.
    //
    // NOTE: plan specified "re-emit previous goal" (copy MotionTarget before
    // collision disrupted it). Current implementation picks a fresh wander-near
    // position instead — intentional simplification. The visual result is similar
    // ("stays nearby") but the pet doesn't resume its original trajectory.
    // Restore-previous-goal semantics deferred to Phase 6 visual review.
    build: () => ({
      targetPosition: pickWanderPosition(
        petX,
        petY,
        bounds,
        random,
        "near",
        personality,
        petWidth(components, id),
      ),
    }),
  });

  const reactionSelection = softmaxSample(
    reactiveCandidates.map((candidate) => ({
      ...candidate,
      score: moodAdjustedDecisionScore(
        candidate.kind,
        signedDecisionScore(personality.catalogId, candidate.kind, candidate.score),
        mood,
      ),
    })),
    personality.neuroticism,
    random,
  );
  const reactionWinner = reactionSelection.winner;
  components.setComponent(id, {
    type: "BehaviorDecisionToken",
    kind: reactionWinner.kind,
    decidedAt: now,
    consumed: false,
    selectionTrace: reactionSelection.trace,
    ...reactionWinner.build(),
  });
  claim(components, id, "autonomous", now, reactionWinner.kind);
  components.removeComponent(id, "PendingReaction");
  return true;
}
