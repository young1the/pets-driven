import type {
  ComponentOf,
  ComponentType,
} from "@/core/components";
import type { PetSnapshot } from "@/core/world-snapshot";
import { PLAYGROUND_TEXT } from "./playground-text";

const INSPECTED_COMPONENTS: ComponentType[] = [
  "Personality",
  "BehaviorDecisionState",
  "IdleConversation",
  "WalkingTag",
  "ClimbingTag",
  "FlyingTag",
  "AirborneTag",
  "CanWalk",
  "CanJump",
  "JumpActionState",
  "CanWallClimb",
  "ClimbIntentState",
  "ClimbDismountState",
  "CanFly",
  "WandersOnArrival",
  "ContactState",
  "MotionTarget",
];

type ComponentReader = <TType extends ComponentType>(
  id: string,
  type: TType,
) => ComponentOf<TType> | undefined;

type BehaviorLabProps = {
  pets: PetSnapshot[];
  selectedPetId: string;
  onSelectPet(id: string): void;
  getComponent: ComponentReader;
};

export function BehaviorLab({
  pets,
  selectedPetId,
  onSelectPet,
  getComponent,
}: BehaviorLabProps) {
  const selectedPet = pets.find((pet) => pet.id === selectedPetId) ?? pets[0];
  if (!selectedPet) {
    return null;
  }

  const contact = getComponent(selectedPet.id, "ContactState");
  const motion = getComponent(selectedPet.id, "MotionTarget");
  const jumpAction = getComponent(selectedPet.id, "JumpActionState");
  const climbIntent = getComponent(selectedPet.id, "ClimbIntentState");
  const climbDismount = getComponent(selectedPet.id, "ClimbDismountState");
  const personality = getComponent(selectedPet.id, "Personality");
  const decisionToken = getComponent(selectedPet.id, "BehaviorDecisionToken");
  const pendingReaction = getComponent(selectedPet.id, "PendingReaction");
  const componentTypes = INSPECTED_COMPONENTS.filter((type) =>
    getComponent(selectedPet.id, type),
  );

  return (
    <section className="behavior-lab">
      <h2>{PLAYGROUND_TEXT.behaviorLabTitle}</h2>
      <div className="behavior-lab__selector">
        <span>{PLAYGROUND_TEXT.selectedPetLabel}</span>
        <div>
          {pets.map((pet) => (
            <button
              key={pet.id}
              type="button"
              aria-pressed={pet.id === selectedPet.id}
              onClick={() => onSelectPet(pet.id)}
            >
              {pet.name}
            </button>
          ))}
        </div>
      </div>
      {personality && (
        <div className="behavior-lab__ocean">
          <h3>{PLAYGROUND_TEXT.oceanTitle}</h3>
          <dl className="behavior-lab__ocean-bars">
            {(
              [
                ["O", personality.openness],
                ["C", personality.conscientiousness],
                ["E", personality.extraversion],
                ["A", personality.agreeableness],
                ["N", personality.neuroticism],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className="behavior-lab__ocean-bar">
                <dt>{label}</dt>
                <dd>
                  <meter min={0} max={1} value={value} />
                  <span>{value.toFixed(2)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <dl className="behavior-lab__state">
        {decisionToken && (
          <div>
            <dt>{PLAYGROUND_TEXT.decisionTokenLabel}</dt>
            <dd>
              {decisionToken.kind}
              {decisionToken.consumed ? " (consumed)" : " (pending)"}
            </dd>
          </div>
        )}
        {pendingReaction && (
          <div>
            <dt>{PLAYGROUND_TEXT.pendingReactionLabel}</dt>
            <dd>
              {pendingReaction.source} — reacts at {pendingReaction.reactsAt}ms
            </dd>
          </div>
        )}
        <div>
          <dt>Intent</dt>
          <dd>{selectedPet.intent}</dd>
        </div>
        <div>
          <dt>Locomotion</dt>
          <dd>{selectedPet.locomotion}</dd>
        </div>
        <div>
          <dt>Grounded</dt>
          <dd>{contact?.grounded ? "true" : "false"}</dd>
        </div>
        <div>
          <dt>Climb contact</dt>
          <dd>{contact?.climbableSurfaceId ?? "none"}</dd>
        </div>
        <div>
          <dt>Motion target</dt>
          <dd>{formatMotionTarget(motion)}</dd>
        </div>
        <div>
          <dt>Jump phase</dt>
          <dd>{jumpAction?.phase ?? "none"}</dd>
        </div>
        <div>
          <dt>Jump cooldown</dt>
          <dd>{jumpAction?.cooldownMs ?? 0}ms</dd>
        </div>
        <div>
          <dt>Climb intent</dt>
          <dd>{formatClimbIntent(climbIntent)}</dd>
        </div>
        <div>
          <dt>Dismount phase</dt>
          <dd>{climbDismount?.phase ?? "none"}</dd>
        </div>
        <div>
          <dt>Dismount cooldown</dt>
          <dd>{climbDismount?.cooldownMs ?? 0}ms</dd>
        </div>
        <div>
          <dt>{PLAYGROUND_TEXT.componentPanelTitle}</dt>
          <dd className="behavior-lab__components">
            {componentTypes.map((type) => {
              const comp = getComponent(selectedPet.id, type);
              if (!comp) return null;
              const fields = Object.entries(comp).filter(([key]) => key !== "type");
              return (
                <details key={type} className="behavior-lab__component-detail">
                  <summary>{type}</summary>
                  {fields.length > 0 && (
                    <dl className="behavior-lab__component-fields">
                      {fields.map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{formatComponentValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </details>
              );
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function formatClimbIntent(
  climbIntent: ComponentOf<"ClimbIntentState"> | undefined,
) {
  if (!climbIntent) {
    return "none";
  }

  return `${climbIntent.phase} ${climbIntent.surfaceEntityId} -> ${Math.round(
    climbIntent.targetY,
  )}`;
}

function formatComponentValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatMotionTarget(
  motion: ComponentOf<"MotionTarget"> | undefined,
) {
  if (!motion) {
    return "none";
  }

  if (motion.targetEntityId) {
    return motion.targetEntityId;
  }

  if (motion.targetPosition) {
    return `${Math.round(motion.targetPosition.x)}, ${Math.round(
      motion.targetPosition.y,
    )}`;
  }

  return "none";
}
