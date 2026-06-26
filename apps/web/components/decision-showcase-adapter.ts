import type { ComponentOf, ComponentType } from "@pets-driven/pet-engine/core/components";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import type {
  BehaviorDecisionKind,
  BehaviorDecisionSelectionCandidate,
} from "@pets-driven/pet-engine/features/behavior/components";
import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";

export type DecisionStimulus = {
  channel: "agent" | "autonomous" | "collision";
  label: string;
  detail: string;
};

export type DecisionPipelineStep = {
  id: "stimulus" | "priority" | "decision" | "planning" | "presentation";
  title: string;
  status: "idle" | "active" | "complete";
  value: string;
  detail: string;
};

export type DecisionPipelineExplanation = {
  selection: DecisionSelectionExplanation | null;
  steps: DecisionPipelineStep[];
};

export type DecisionSelectionExplanation = {
  temperature: number;
  randomRoll: number;
  selectedKind: BehaviorDecisionKind;
  candidates: Pick<
    BehaviorDecisionSelectionCandidate,
    "kind" | "score" | "probability" | "cumulativeProbability" | "selected"
  >[];
};

type ComponentReader = <TType extends ComponentType>(
  id: string,
  type: TType,
) => ComponentOf<TType> | undefined;

type AgentDecisionEventType = AgentWorldEvent["type"];

type StimulusResult<T = Record<string, unknown>> =
  | ({ ok: true; stimulus: DecisionStimulus } & T)
  | { ok: false; error: string };

export function createAgentDecisionStimulus(input: {
  getComponent: ComponentReader;
  now: number;
  petId: string;
  summary?: string;
  type: AgentDecisionEventType;
}): StimulusResult<{ event: AgentWorldEvent }> {
  const binding = input.getComponent(input.petId, "AgentBinding");
  if (!binding) {
    return {
      ok: false,
      error: "Selected pet has no agent binding.",
    };
  }

  return {
    ok: true,
    event: {
      kind: "agent",
      type: input.type,
      sourceId: binding.sourceId,
      at: input.now,
      summary: input.summary,
    },
    stimulus: {
      channel: "agent",
      label: input.type,
      detail: input.summary ?? binding.sourceId,
    },
  };
}

export function applyCollisionDecisionStimulus(input: {
  world: {
    getComponent: ComponentReader;
    setComponent(
      id: string,
      component:
        | ComponentOf<"BehaviorDecisionState">
        | ComponentOf<"PendingReaction">
        | ComponentOf<"Transform">
        | ComponentOf<"PetCollision">,
    ): void;
    setPhysicsPosition(id: string, position: Partial<{ x: number; y: number }>): void;
    setPhysicsVelocity(id: string, velocity: Partial<{ x: number; y: number }>): void;
  };
  petId: string;
  colliderPetId: string;
  now: number;
}): StimulusResult {
  const petTransform = input.world.getComponent(input.petId, "Transform");
  const petBody = input.world.getComponent(input.petId, "PhysicsBody");
  const colliderTransform = input.world.getComponent(input.colliderPetId, "Transform");
  const colliderBody = input.world.getComponent(input.colliderPetId, "PhysicsBody");

  if (!petTransform || !petBody) {
    return { ok: false, error: "Selected pet has no physics body." };
  }

  if (!colliderTransform || !colliderBody) {
    return { ok: false, error: "Collision stimulus needs another pet with a physics body." };
  }

  const overlap = {
    x: petTransform.position.x + Math.min(8, petBody.width / 4),
    y: petTransform.position.y,
  };

  input.world.setPhysicsVelocity(input.petId, { x: 0, y: 0 });
  input.world.setPhysicsVelocity(input.colliderPetId, { x: 0, y: 0 });
  input.world.setPhysicsPosition(input.petId, petTransform.position);
  input.world.setPhysicsPosition(input.colliderPetId, overlap);
  input.world.setComponent(input.colliderPetId, {
    type: "Transform",
    position: overlap,
  });
  input.world.setComponent(input.petId, {
    type: "PetCollision",
    otherEntityId: input.colliderPetId,
    otherPosition: overlap,
    startedAt: input.now,
    lastSeenAt: input.now,
  });
  const reactsAt = input.now;
  input.world.setComponent(input.petId, {
    type: "PendingReaction",
    source: "collision",
    triggeredAt: input.now,
    reactsAt,
    context: {
      otherEntityId: input.colliderPetId,
      otherPosition: overlap,
    },
  });
  input.world.setComponent(input.petId, {
    type: "BehaviorDecisionState",
    source: "collision",
    decidedAt: input.now,
    expiresAt: reactsAt,
    reason: "entity overlap",
    lastAutonomousReason: null,
    lastAutonomousAt: null,
  });

  return {
    ok: true,
    stimulus: {
      channel: "collision",
      label: "pet collision",
      detail: `${input.colliderPetId} overlaps ${input.petId}`,
    },
  };
}

export function explainDecisionPipeline(input: {
  getComponent: ComponentReader;
  lastStimulus: DecisionStimulus | null;
  now: number;
  pet: PetSnapshot;
}): DecisionPipelineExplanation {
  const decision = input.getComponent(input.pet.id, "BehaviorDecisionState");
  const token = input.getComponent(input.pet.id, "BehaviorDecisionToken");
  const pendingReaction = input.getComponent(input.pet.id, "PendingReaction");
  const agentTask = input.getComponent(input.pet.id, "AgentTaskState");
  const intent = input.getComponent(input.pet.id, "IntentState");
  const motion = input.getComponent(input.pet.id, "MotionTarget");
  const speech = input.getComponent(input.pet.id, "SpeechState");
  const jump = input.getComponent(input.pet.id, "JumpActionState");
  const climb = input.getComponent(input.pet.id, "ClimbIntentState");
  const action = jump?.phase ?? climb?.phase ?? (motion?.targetPosition ? "move" : "none");
  const presentationValue = agentTask?.status ?? (speech?.speech ? "speech" : "quiet");

  return {
    selection: token?.selectionTrace
      ? {
          temperature: token.selectionTrace.temperature,
          randomRoll: token.selectionTrace.randomRoll,
          selectedKind: token.selectionTrace.selectedKind,
          candidates: token.selectionTrace.candidates.map((candidate) => ({
            kind: candidate.kind,
            score: candidate.score,
            probability: candidate.probability,
            cumulativeProbability: candidate.cumulativeProbability,
            selected: candidate.selected,
          })),
        }
      : null,
    steps: [
      {
        id: "stimulus",
        title: "Stimulus",
        status: input.lastStimulus ? "complete" : "idle",
        value: input.lastStimulus?.label ?? "waiting",
        detail: input.lastStimulus?.detail ?? "Inject an event or collision to start the pipeline.",
      },
      {
        id: "priority",
        title: "Priority claim",
        status: decision || pendingReaction ? "complete" : "idle",
        value: pendingReaction?.source ?? decision?.source ?? "none",
        detail: pendingReaction
          ? `reacts at ${Math.max(0, pendingReaction.reactsAt - input.now)}ms`
          : decision?.reason ?? "No active claim.",
      },
      {
        id: "decision",
        title: "Decision token",
        status: token ? "complete" : pendingReaction ? "active" : "idle",
        value: pendingReaction ? "deliberating" : (token?.kind ?? "none"),
        detail: pendingReaction
          ? "Collision reaction latency is holding the pet before choosing a token."
          : token
            ? (token.consumed ? "Token consumed by planning." : "Token is pending planning.")
            : "No token emitted yet.",
      },
      {
        id: "planning",
        title: "Planning result",
        status: intent || motion || jump || climb ? "complete" : "idle",
        value: intent?.intent ?? "none",
        detail: formatPlanningDetail(action, motion),
      },
      {
        id: "presentation",
        title: "Presentation",
        status: agentTask || speech?.speech || input.pet.visualCue ? "complete" : "idle",
        value: presentationValue,
        detail: agentTask?.summary ?? speech?.speech ?? input.pet.visualCue?.label ?? "No visible cue.",
      },
    ],
  };
}

function formatPlanningDetail(
  action: string,
  motion: ComponentOf<"MotionTarget"> | undefined,
) {
  if (motion?.targetEntityId) {
    return `${action} toward ${motion.targetEntityId}`;
  }

  if (motion?.targetPosition) {
    return `${action} to ${Math.round(motion.targetPosition.x)}, ${Math.round(
      motion.targetPosition.y,
    )}`;
  }

  return action;
}
