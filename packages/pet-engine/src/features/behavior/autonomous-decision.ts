import {
  expressivePoseDurationMs,
  FEINT_BASE_MS,
  FEINT_EXTRA_MS,
  ROMP_BASE_MS,
  ROMP_EXTRA_MS,
  STRUT_BODY_WIDTHS,
  STRUT_DURATION_MS,
  WITHDRAW_BODY_WIDTHS,
  WITHDRAW_DURATION_MS,
} from "@pets-driven/pet-engine/features/behavior/activity-tuning";
import { claim } from "@pets-driven/pet-engine/features/behavior/claim";
import type { PersonalityComponent } from "@pets-driven/pet-engine/features/behavior/components";
import {
  type Candidate,
  type DecisionContext,
  isNearUserAnchor,
  pickWanderPosition,
  pushCandidate,
  softmaxSample,
} from "@pets-driven/pet-engine/features/behavior/decision-candidates";
import {
  SECOND_SIGNATURE_POSE,
  scoreApproachPet,
  scoreBeckon,
  scoreChaseCursor,
  scoreClimb,
  scoreFetchItem,
  scoreFleeFromPet,
  scoreFollowRoutine,
  scoreFret,
  scoreGreet,
  scoreGroom,
  scoreIdleStay,
  scoreInspect,
  scoreJump,
  scoreKeepWatch,
  scoreMeditate,
  scoreNap,
  scoreObserve,
  scoreOfferComfort,
  scorePeek,
  scorePlayFeint,
  scorePlayRomp,
  scoreSeekUser,
  scoreStandLookout,
  scoreStrut,
  scoreWanderFar,
  scoreWanderNear,
  scoreWithdraw,
} from "@pets-driven/pet-engine/features/behavior/decision-scores";
import {
  COLLISION_TARGET_MARGIN,
  clampToBoundsX,
  clampToBoundsY,
  petWidth,
} from "@pets-driven/pet-engine/features/behavior/geometry";
import { moodAdjustedDecisionScore } from "@pets-driven/pet-engine/features/mood/systems";
import {
  personalityIdleDurationScale,
  signedDecisionScore,
} from "@pets-driven/pet-engine/pets/personalities/behavior-signatures";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";

const PET_FLEE_WIDTH_MULTIPLIER = 6;

// idle-stay: a real rest. Introverts settle for much longer than extraverts.
const IDLE_STAY_BASE_MS = 3_000;
const IDLE_STAY_INTROVERSION_MS = 9_000;
const IDLE_STAY_JITTER_MS = 3_000;

/** Personality-scaled rest length for an idle-stay decision. */
function idleStayDurationMs(p: PersonalityComponent, random: RandomSource): number {
  return Math.round(
    (IDLE_STAY_BASE_MS +
      (1 - p.extraversion) * IDLE_STAY_INTROVERSION_MS +
      random.next() * IDLE_STAY_JITTER_MS) *
      personalityIdleDurationScale(p.catalogId),
  );
}

/**
 * The ordinary autonomous pool: everything a pet may choose to do when nothing
 * else has a claim on it. `claimedSurfaces` and `claimedItems` are shared
 * across the whole pass so two pets cannot reserve the same climbable — or set
 * off after the same trinket — in one tick.
 */
export function decideAutonomousBehavior(
  { components, id, now, random, bounds, personality, petX, petY, drives, mood }: DecisionContext,
  claimedSurfaces: Set<string>,
  claimedItems: Set<string>,
): void {
  // Read world context from this pet's Perception snapshot.
  const perception = components.getComponent(id, "Perception");
  const perceptionAnchor = perception?.userAnchor;
  const userAnchor: { id: string; x: number; y: number } | null = perceptionAnchor
    ? {
        id: perceptionAnchor.id,
        x: perceptionAnchor.position.x,
        y: perceptionAnchor.position.y,
      }
    : null;

  const isFlying = !!components.getComponent(id, "FlyingTag");

  const candidates: Candidate[] = [];

  pushCandidate(candidates, components, id, now, {
    kind: "wander-near",
    score: scoreWanderNear(personality),
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

  pushCandidate(candidates, components, id, now, {
    kind: "wander-far",
    score: scoreWanderFar(personality, drives),
    build: () => ({
      targetPosition: pickWanderPosition(
        petX,
        petY,
        bounds,
        random,
        "far",
        personality,
        petWidth(components, id),
      ),
    }),
  });

  if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
    pushCandidate(candidates, components, id, now, {
      kind: "seek-user",
      score: scoreSeekUser(personality, drives),
      // MotionTargetSystem (UPDATE phase) reads Perception.userAnchor and owns
      // seek positioning; Planning only needs to promote intent to "seek".
      build: () => ({}),
    });
  }

  // Cursor play — a fast/darting cursor near this pet offers chase-cursor,
  // independent of the seek-user proximity gate above (playful chasing can
  // happen right next to the user, unlike the "come say hi" seek-user drive).
  if (userAnchor && perception?.cursor?.isPlayful) {
    pushCandidate(candidates, components, id, now, {
      kind: "chase-cursor",
      score: scoreChaseCursor(personality),
      build: () => ({
        targetEntityId: userAnchor.id,
        targetPosition: { x: userAnchor.x, y: userAnchor.y },
      }),
    });
  }

  const canJump = components.getComponent(id, "CanJump");
  const jumpState = components.getComponent(id, "JumpActionState");
  const contact = components.getComponent(id, "ContactState");
  if (canJump && !jumpState && (!contact || contact.grounded)) {
    pushCandidate(candidates, components, id, now, {
      kind: "request-jump",
      score: scoreJump(personality, drives),
      // Jump is a one-shot action; Planning reads JumpActionState directly.
      build: () => ({}),
    });
  }

  // Sustained solo play: a grounded walker can string hops and dashes
  // together for several seconds (RompProgressSystem choreographs it).
  const isGroundedWalker =
    !!components.getComponent(id, "WalkingTag") &&
    !isFlying &&
    !components.getComponent(id, "ClimbingTag") &&
    (!contact || contact.grounded);
  if (canJump && !jumpState && isGroundedWalker && personality.catalogId === "playful") {
    pushCandidate(candidates, components, id, now, {
      kind: "play-romp",
      score: scorePlayRomp(personality, drives),
      build: () => ({
        activityDurationMs: Math.round(ROMP_BASE_MS + random.next() * ROMP_EXTRA_MS),
      }),
    });
  }

  // A trinket on the floor is worth crossing the room for: collecting one is
  // the only way an ordinary walker ever gets to fly or climb. A pet already
  // wearing an ability leaves the next one for someone else, which is what
  // keeps `CarriedItem` a single record the revoke path can trust.
  const carriedItem = components.getComponent(id, "CarriedItem");
  const nearestItem = carriedItem
    ? undefined
    : perception?.nearbyItems?.find((item) => !claimedItems.has(item.id));
  if (nearestItem) {
    pushCandidate(candidates, components, id, now, {
      kind: "fetch-item",
      score: scoreFetchItem(personality, drives),
      // A position, not an entity target: trinkets never move, and an entity
      // target would send ArrivalBehaviorSystem down its approach-pet branch,
      // which has no idea what this is and would never clear the target.
      build: () => {
        claimedItems.add(nearestItem.id);
        return { targetPosition: { ...nearestItem.position } };
      },
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
        ? {
            id: nearestClimbable.id,
            x: nearestClimbable.position.x,
            y: nearestClimbable.position.y,
          }
        : null;
    if (surface) {
      pushCandidate(candidates, components, id, now, {
        kind: "request-climb",
        score: scoreClimb(personality, drives),
        build: () => {
          // Reserve the surface so later entities in this same pass won't
          // double-target it (build() runs before the next entity is processed).
          claimedSurfaces.add(surface.id);
          return {
            climbSurfaceId: surface.id,
            climbTargetY: surface.y - 80,
          };
        },
      });
    }
  }

  // Phase 3: social candidates — only when another pet is within perception range.
  const nearbyPets = perception?.nearbyPets ?? [];
  if (nearbyPets.length > 0) {
    const nearestPet = nearbyPets[0];
    pushCandidate(candidates, components, id, now, {
      kind: "approach-pet",
      score: scoreApproachPet(personality, drives),
      // Keep the entity id so MotionTargetSystem can track the moving pet
      // until a collision reaction interrupts the approach.
      build: () => ({
        targetEntityId: nearestPet.id,
        targetPosition: { ...nearestPet.position },
      }),
    });

    const fleeDirX = petX - nearestPet.position.x;
    const fleeDirY = petY - nearestPet.position.y;
    const fleeLen = Math.hypot(fleeDirX, fleeDirY) || 1;
    const fleeDistance = petWidth(components, id) * PET_FLEE_WIDTH_MULTIPLIER;
    const fleePos = {
      x: clampToBoundsX(
        petX + (fleeDirX / fleeLen) * fleeDistance,
        bounds,
        COLLISION_TARGET_MARGIN,
      ),
      y: clampToBoundsY(
        petY + (fleeDirY / fleeLen) * fleeDistance,
        bounds,
        COLLISION_TARGET_MARGIN,
      ),
    };
    pushCandidate(candidates, components, id, now, {
      kind: "flee-from-pet",
      score: scoreFleeFromPet(personality),
      build: () => ({ targetPosition: fleePos }),
    });
  }

  // Expressive idle poses — sustained, stationary gestures that light up
  // the otherwise agent-only sprite rows. Each is gated to the context that
  // makes it read, then materialized as a claim held for its whole
  // duration. Greeting waves at the user when they are near (pet-to-pet
  // hellos are already served by approach-pet); beckoning calls the user
  // over when they are far. Catalog-exclusive poses are gated by both
  // user distance and catalog id so their silhouettes do not leak into
  // neighboring personalities.
  if (userAnchor && isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
    pushCandidate(candidates, components, id, now, {
      kind: "greet",
      score: scoreGreet(personality, drives),
      build: () => ({ activityDurationMs: expressivePoseDurationMs("greet", random) }),
    });
    if (isGroundedWalker && personality.catalogId === "mischievous") {
      pushCandidate(candidates, components, id, now, {
        kind: "play-feint",
        score: scorePlayFeint(personality),
        build: () => ({
          targetEntityId: userAnchor.id,
          targetPosition: { x: userAnchor.x, y: userAnchor.y },
          activityDurationMs: Math.round(FEINT_BASE_MS + random.next() * FEINT_EXTRA_MS),
        }),
      });
    }
    if (isGroundedWalker && personality.catalogId === "attentive") {
      pushCandidate(candidates, components, id, now, {
        kind: "keep-watch",
        score: scoreKeepWatch(personality, drives),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("keep-watch", random),
        }),
      });
    }
    if (isGroundedWalker && personality.catalogId === "gentle") {
      pushCandidate(candidates, components, id, now, {
        kind: "offer-comfort",
        score: scoreOfferComfort(personality, drives),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("offer-comfort", random),
        }),
      });
    }
    if (isGroundedWalker && personality.catalogId === "aloof") {
      const direction =
        petX === userAnchor.x ? (random.next() < 0.5 ? -1 : 1) : Math.sign(petX - userAnchor.x);
      const targetPosition = {
        x: clampToBoundsX(
          petX + direction * petWidth(components, id) * WITHDRAW_BODY_WIDTHS,
          bounds,
          COLLISION_TARGET_MARGIN,
        ),
        y: petY,
      };
      pushCandidate(candidates, components, id, now, {
        kind: "withdraw",
        score: scoreWithdraw(personality),
        build: () => ({
          targetPosition,
          activityDurationMs: WITHDRAW_DURATION_MS,
        }),
      });
    }
  }

  if (userAnchor && !isNearUserAnchor(userAnchor, petX, petY, isFlying)) {
    pushCandidate(candidates, components, id, now, {
      kind: "beckon",
      score: scoreBeckon(personality, drives),
      build: () => ({ activityDurationMs: expressivePoseDurationMs("beckon", random) }),
    });
    if (isGroundedWalker && personality.catalogId === "reserved") {
      pushCandidate(candidates, components, id, now, {
        kind: "peek",
        score: scorePeek(personality),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("peek", random),
        }),
      });
    }
  }

  if (isGroundedWalker) {
    if (personality.catalogId === "curious") {
      pushCandidate(candidates, components, id, now, {
        kind: "inspect",
        score: scoreInspect(personality, drives),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("inspect", random),
        }),
      });
    }
    if (personality.catalogId === "steady") {
      pushCandidate(candidates, components, id, now, {
        kind: "follow-routine",
        score: scoreFollowRoutine(personality),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("follow-routine", random),
        }),
      });
    }
    if (personality.catalogId === "feisty") {
      const direction = random.next() < 0.5 ? -1 : 1;
      const distance = petWidth(components, id) * STRUT_BODY_WIDTHS;
      const preferredX = clampToBoundsX(
        petX + direction * distance,
        bounds,
        COLLISION_TARGET_MARGIN,
      );
      const alternateX = clampToBoundsX(
        petX - direction * distance,
        bounds,
        COLLISION_TARGET_MARGIN,
      );
      const targetX =
        Math.abs(preferredX - petX) >= Math.abs(alternateX - petX) ? preferredX : alternateX;
      pushCandidate(candidates, components, id, now, {
        kind: "strut",
        score: scoreStrut(personality),
        build: () => ({
          targetPosition: {
            x: targetX,
            y: petY,
          },
          activityDurationMs: STRUT_DURATION_MS,
        }),
      });
    }
    if (personality.catalogId === "skittish") {
      pushCandidate(candidates, components, id, now, {
        kind: "stand-lookout",
        score: scoreStandLookout(personality),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("stand-lookout", random),
        }),
      });
    }
    pushCandidate(candidates, components, id, now, {
      kind: "groom",
      score: scoreGroom(personality),
      build: () => ({ activityDurationMs: expressivePoseDurationMs("groom", random) }),
    });
    pushCandidate(candidates, components, id, now, {
      kind: "observe",
      score: scoreObserve(personality, drives),
      build: () => ({ activityDurationMs: expressivePoseDurationMs("observe", random) }),
    });
    pushCandidate(candidates, components, id, now, {
      kind: "fret",
      score: scoreFret(personality),
      build: () => ({ activityDurationMs: expressivePoseDurationMs("fret", random) }),
    });
    if (personality.catalogId === "lazy") {
      pushCandidate(candidates, components, id, now, {
        kind: "nap",
        score: scoreNap(personality, drives),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("nap", random),
        }),
      });
    }
    if (personality.catalogId === "zen") {
      pushCandidate(candidates, components, id, now, {
        kind: "meditate",
        score: scoreMeditate(personality),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs("meditate", random),
        }),
      });
    }

    // Second signature pose per personality — a catalog-exclusive stationary
    // beat that stands alongside each preset's first signature. All hold a
    // still pose, so they share the expressive materialization path; only
    // the choreography, cue, and gating differ.
    const secondSignature = SECOND_SIGNATURE_POSE[personality.catalogId ?? ""];
    if (secondSignature) {
      pushCandidate(candidates, components, id, now, {
        kind: secondSignature.kind,
        score: secondSignature.score(personality, drives),
        build: () => ({
          activityDurationMs: expressivePoseDurationMs(secondSignature.kind, random),
        }),
      });
    }
  }

  pushCandidate(candidates, components, id, now, {
    kind: "idle-stay",
    score: scoreIdleStay(personality, drives),
    build: () => ({}),
  });

  if (candidates.length === 0) return;
  // Softmax sampling: temperature scales with neuroticism.
  // High N → higher T → flatter distribution → more erratic behaviour.
  const selection = softmaxSample(
    candidates.map((candidate) => ({
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
  const winner = selection.winner;
  const tokenFields = winner.build();
  components.setComponent(id, {
    type: "BehaviorDecisionToken",
    kind: winner.kind,
    decidedAt: now,
    consumed: false,
    selectionTrace: selection.trace,
    ...tokenFields,
  });
  // Sustained activities hold their claim for their whole duration:
  // idle-stay becomes a genuine, personality-length rest instead of a
  // 500 ms pause before the next re-roll, and play-romp keeps its claim
  // while RompProgressSystem choreographs the hops.
  const activityExpiresAt =
    winner.kind === "idle-stay"
      ? now + idleStayDurationMs(personality, random)
      : tokenFields.activityDurationMs !== undefined
        ? now + tokenFields.activityDurationMs
        : undefined;
  claim(components, id, "autonomous", now, winner.kind, activityExpiresAt);
}
