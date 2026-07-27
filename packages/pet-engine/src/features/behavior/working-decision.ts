import { claim } from "@pets-driven/pet-engine/features/behavior/claim";
import {
  type Candidate,
  type DecisionContext,
  pickWanderPosition,
  softmaxSample,
} from "@pets-driven/pet-engine/features/behavior/decision-candidates";
import { petWidth } from "@pets-driven/pet-engine/features/behavior/geometry";
import {
  TOOL_ACTIVITY_FRESHNESS_MS,
  workingBehaviorHoldMs,
  workingStyle,
} from "@pets-driven/pet-engine/pets/personalities/working-styles";

/**
 * The work candidate pool. A pet bound to a working agent still goes through
 * the ordinary decision/token/planning pipeline — it just draws from
 * work-focus / work-review / work-pace instead of the autonomous pool.
 */
export function decideWorkingBehavior({
  components,
  id,
  now,
  random,
  bounds,
  personality,
  petX,
  petY,
}: DecisionContext): boolean {
  const style = workingStyle(personality);
  const signal = components.getComponent(id, "AgentActivitySignal");
  const freshActivity =
    signal && now - signal.at <= TOOL_ACTIVITY_FRESHNESS_MS ? signal.activity : null;
  const holdMs = workingBehaviorHoldMs(style, random.next());
  const workingCandidates: Candidate[] = [
    {
      kind: "work-focus",
      score: style.focusScore + (freshActivity === "edit" ? 0.35 : 0),
      build: () => ({ activityDurationMs: holdMs }),
    },
    {
      kind: "work-review",
      score: style.reviewScore + (freshActivity === "study" ? 0.35 : 0),
      build: () => ({ activityDurationMs: holdMs }),
    },
    {
      kind: "work-pace",
      score: style.paceScore + (freshActivity === "run" ? 0.35 : 0),
      build: () => ({
        activityDurationMs: holdMs,
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
    },
  ];
  const workingSelection = softmaxSample(workingCandidates, personality.neuroticism, random);
  const winner = workingSelection.winner;
  const tokenFields = winner.build();
  components.setComponent(id, {
    type: "BehaviorDecisionToken",
    kind: winner.kind,
    decidedAt: now,
    consumed: false,
    selectionTrace: workingSelection.trace,
    ...tokenFields,
  });
  claim(
    components,
    id,
    "autonomous",
    now,
    winner.kind,
    now + (tokenFields.activityDurationMs ?? holdMs),
  );
  return true;
}
