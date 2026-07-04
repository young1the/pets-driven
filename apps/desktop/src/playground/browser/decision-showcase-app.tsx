import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Badge, Button } from "@pets-driven/design-system";
import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { PetSprite } from "@pets-driven/pet-engine/pets/rendering/pet-sprite";
import { presentBehaviorDecisionToken } from "@pets-driven/pet-engine/pets/rendering/behavior-token-presentation";
import type { PetAnimationState } from "@pets-driven/pet-engine/pets/assets/pet-atlas";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import type {
  BehaviorDecisionKind,
  PersonalityComponent,
} from "@pets-driven/pet-engine/features/behavior/components";
import {
  applyCollisionDecisionStimulus,
  createAgentDecisionStimulus,
  explainDecisionPipeline,
  type DecisionSelectionExplanation,
  type DecisionStimulus,
} from "./decision-showcase-adapter";

const STEP_MS = 16;
const PRIMARY_PET_ID = "pet-a";
const COLLIDER_PET_ID = "pet-b";
const SPRITE_URL = "/fallback-pets/patamon/spritesheet.webp";
const SPRITE_SIZE = { width: 192, height: 208 };
const VISUAL_TICK_MS = 120;
const MOTION_RESET_MS = 980;
const PROBABILITY_COUNT_MS = 720;
const PROBABILITY_REVEAL_DELAY_MS = 240;
const SLOT_CARD_WIDTH = 172;
const SLOT_REEL_GAP = 6;
const SLOT_REEL_COPY_SETS = 6;
const SLOT_REEL_ORIGINAL_SET_INDEX = 4;
const SLOT_REEL_PREVIEW_MS = 1800;
const SLOT_REEL_SPIN_MS = 3200;
const SLOT_REEL_STOP_MS = 1400;
const SLOT_REEL_SPIN_DISTANCE_PX = 1520;
const SLOT_REEL_SPIN_EXPONENT = 3.2;
const SLOT_REEL_SETTLED_HOLD_MS = 1100;
const MAX_SELECTION_ADVANCE_FRAMES = 420;

type ShowcaseMotion = "idle" | "agent" | "collision";

type SelectionCandidateView = DecisionSelectionExplanation["candidates"][number];

type DecisionSelectionPrototypeProps = {
  motionSequence: number;
  onSelectionSettled: (kind: BehaviorDecisionKind | null) => void;
  probabilityProgress: number;
  selection: DecisionSelectionExplanation;
};

const AGENT_STIMULI = [
  { type: "task.started", label: "Task started", summary: "Work started" },
  { type: "task.waiting", label: "Needs input", summary: "Waiting for approval" },
  { type: "task.completed", label: "Task completed", summary: "Build completed" },
  { type: "task.failed", label: "Task failed", summary: "Build failed" },
] as const;

export function DecisionShowcaseApp() {
  const scenarioRef = useRef(createDemoScenario());
  const [snapshot, setSnapshot] = useState(() =>
    scenarioRef.current.world.snapshot(),
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastStimulus, setLastStimulus] = useState<DecisionStimulus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visualTick, setVisualTick] = useState(0);
  const [stageMotion, setStageMotion] = useState<ShowcaseMotion>("idle");
  const [motionSequence, setMotionSequence] = useState(0);
  const [probabilityProgress, setProbabilityProgress] = useState(1);
  const [settledDecisionKind, setSettledDecisionKind] = useState<BehaviorDecisionKind | null>(null);
  const [hideSettledSelectionReel, setHideSettledSelectionReel] = useState(false);
  const motionResetRef = useRef<number | null>(null);
  const selectionHideRef = useRef<number | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setVisualTick((current) => current + 1);
    }, VISUAL_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(
    () => () => {
      if (motionResetRef.current !== null) {
        window.clearTimeout(motionResetRef.current);
      }
      if (selectionHideRef.current !== null) {
        window.clearTimeout(selectionHideRef.current);
      }
    },
    [],
  );

  const selectedPet =
    snapshot.pets.find((pet) => pet.id === PRIMARY_PET_ID) ?? snapshot.pets[0];
  const personality = selectedPet
    ? scenarioRef.current.world.getComponent(selectedPet.id, "Personality")
    : undefined;
  const personalitySummary = summarizePersonality(personality);
  const explanation = useMemo(
    () =>
      selectedPet
        ? explainDecisionPipeline({
            getComponent: scenarioRef.current.world.getComponent,
            lastStimulus,
            now: scenarioRef.current.clock.now(),
            pet: selectedPet,
          })
        : { selection: null, steps: [] },
    [elapsedMs, lastStimulus, selectedPet],
  );
  const visualElapsedMs = elapsedMs + visualTick * VISUAL_TICK_MS;
  const petAnimationState = animationStateForPet(selectedPet, settledDecisionKind);
  const petDecisionEmote = presentBehaviorDecisionToken(settledDecisionKind);
  const shouldShowSelectionReel = Boolean(explanation.selection && !hideSettledSelectionReel);

  const handleSelectionSettled = useCallback((kind: BehaviorDecisionKind | null) => {
    setSettledDecisionKind(kind);
    if (selectionHideRef.current !== null) {
      window.clearTimeout(selectionHideRef.current);
    }
    selectionHideRef.current = window.setTimeout(() => {
      setHideSettledSelectionReel(true);
    }, SLOT_REEL_SETTLED_HOLD_MS);
  }, []);

  useEffect(() => {
    if (!explanation.selection) {
      setProbabilityProgress(1);
      setSettledDecisionKind(null);
      setHideSettledSelectionReel(false);
      if (selectionHideRef.current !== null) {
        window.clearTimeout(selectionHideRef.current);
        selectionHideRef.current = null;
      }
      return;
    }

    setProbabilityProgress(0);
    setSettledDecisionKind(null);
    setHideSettledSelectionReel(false);
    if (selectionHideRef.current !== null) {
      window.clearTimeout(selectionHideRef.current);
      selectionHideRef.current = null;
    }
    let animationFrameId = 0;
    const timeoutId = window.setTimeout(() => {
      const startedAt = Date.now();

      function updateProgress() {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / PROBABILITY_COUNT_MS);
        setProbabilityProgress(progress);
        if (progress < 1) {
          animationFrameId = window.requestAnimationFrame(updateProgress);
        }
      }

      updateProgress();
    }, PROBABILITY_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    explanation.selection?.randomRoll,
    explanation.selection?.selectedKind,
    motionSequence,
  ]);

  function advanceFrame(count = 1) {
    for (let index = 0; index < count; index += 1) {
      scenarioRef.current.clock.advanceBy(STEP_MS);
      scenarioRef.current.world.step(STEP_MS);
    }
    setElapsedMs((current) => current + STEP_MS * count);
    setSnapshot(scenarioRef.current.world.snapshot());
  }

  function advanceUntilSelection(maxFrames = MAX_SELECTION_ADVANCE_FRAMES) {
    let frames = 0;
    while (frames < maxFrames) {
      const token = scenarioRef.current.world.getComponent(
        PRIMARY_PET_ID,
        "BehaviorDecisionToken",
      );
      if (token?.selectionTrace) break;
      scenarioRef.current.clock.advanceBy(STEP_MS);
      scenarioRef.current.world.step(STEP_MS);
      frames += 1;
    }
    setElapsedMs((current) => current + STEP_MS * frames);
    setSnapshot(scenarioRef.current.world.snapshot());
  }

  function resetPetDecisionReadiness(options: { clearPresentation?: boolean } = {}) {
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "BehaviorDecisionState");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "BehaviorDecisionToken");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "PendingReaction");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "PetCollision");
    scenarioRef.current.world.removeComponent(COLLIDER_PET_ID, "PetCollision");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "AirborneTag");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "ClimbingTag");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "ClimbIntentState");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "JumpActionState");
    if (options.clearPresentation) {
      scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "AgentTaskState");
      scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "TaskMovementHold");
      const speech = scenarioRef.current.world.getComponent(PRIMARY_PET_ID, "SpeechState");
      if (speech) {
        speech.speech = null;
        speech.expiresAt = null;
      }
    }
    scenarioRef.current.world.setComponent(PRIMARY_PET_ID, {
      type: "IntentState",
      intent: "idle",
    });
    scenarioRef.current.world.setComponent(PRIMARY_PET_ID, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });
    resetColliderPosition();
  }

  function settleFreshInjection(options: { clearPresentation?: boolean } = {}) {
    resetPetDecisionReadiness(options);
    advanceFrame();
    resetPetDecisionReadiness(options);
  }

  function resetColliderPosition() {
    const petTransform = scenarioRef.current.world.getComponent(PRIMARY_PET_ID, "Transform");
    const colliderTransform = scenarioRef.current.world.getComponent(COLLIDER_PET_ID, "Transform");
    if (!petTransform || !colliderTransform) return;

    const position = {
      x: petTransform.position.x + 260,
      y: petTransform.position.y,
    };
    scenarioRef.current.world.setPhysicsVelocity(COLLIDER_PET_ID, { x: 0, y: 0 });
    scenarioRef.current.world.setPhysicsPosition(COLLIDER_PET_ID, position);
    scenarioRef.current.world.setComponent(COLLIDER_PET_ID, {
      type: "Transform",
      position,
    });
  }

  function runStimulusDecisionSelection() {
    settleFreshInjection();
    advanceFrame();
  }

  function playStageMotion(motion: ShowcaseMotion) {
    if (motionResetRef.current !== null) {
      window.clearTimeout(motionResetRef.current);
    }

    setStageMotion(motion);
    setMotionSequence((current) => current + 1);
    motionResetRef.current = window.setTimeout(() => {
      setStageMotion("idle");
      motionResetRef.current = null;
    }, MOTION_RESET_MS);
  }

  function handleAgentStimulus(type: (typeof AGENT_STIMULI)[number]["type"], summary: string) {
    resetPetDecisionReadiness();
    const result = createAgentDecisionStimulus({
      getComponent: scenarioRef.current.world.getComponent,
      now: scenarioRef.current.clock.now(),
      petId: PRIMARY_PET_ID,
      summary,
      type,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    scenarioRef.current.world.pushEvent(result.event);
    setLastStimulus(result.stimulus);
    playStageMotion("agent");
    advanceFrame();
  }

  function handleCollisionStimulus() {
    settleFreshInjection({ clearPresentation: true });
    const result = applyCollisionDecisionStimulus({
      colliderPetId: COLLIDER_PET_ID,
      now: scenarioRef.current.clock.now(),
      petId: PRIMARY_PET_ID,
      world: scenarioRef.current.world,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setLastStimulus(result.stimulus);
    playStageMotion("collision");
    advanceFrame();
    advanceUntilSelection();
  }

  function handleAutonomousStimulus() {
    settleFreshInjection({ clearPresentation: true });

    const stimulus: DecisionStimulus = {
      channel: "autonomous",
      label: "autonomous roll",
      detail: "BehaviorDecisionSystem softmax candidate pool",
    };

    setError(null);
    setLastStimulus(stimulus);
    playStageMotion("agent");
    advanceFrame();
  }

  if (!selectedPet) {
    return null;
  }

  return (
    <section className="decision-showcase">
      <header className="decision-showcase__header">
        <div>
          <h1>Decision system</h1>
          <p>Live status screen for the real pet behavior pipeline.</p>
        </div>
        <Badge tone="info">Actual simulation</Badge>
      </header>

      {error ? (
        <p className="decision-showcase__error" role="status">
          {error}
        </p>
      ) : null}

      <div className="decision-showcase__layout">
        <section
          className="decision-showcase__stage"
          data-motion={stageMotion}
          data-motion-sequence={motionSequence}
          data-testid="decision-showcase-stage"
        >
          <div className="decision-showcase__stage-topline">
            <span>Status screen</span>
            <strong>
              {selectedPet.name} · {personalitySummary}
            </strong>
          </div>
          <div
            className="decision-showcase__pet"
            data-pet-animation-state={petAnimationState}
            data-testid="decision-pet-stage"
          >
            <PetSprite
              alt={`${selectedPet.name} sprite`}
              decisionEmote={petDecisionEmote}
              animationState={petAnimationState}
              className="decision-showcase__live-sprite"
              elapsedMs={visualElapsedMs}
              imageUrl={SPRITE_URL}
              scale={0.88}
              size={SPRITE_SIZE}
            />
            {stageMotion === "collision" ? (
              <>
                <span
                  data-testid="decision-collider-sprite"
                  key={`collider-${motionSequence}`}
                >
                  <PetSprite
                    alt="Bob collider sprite"
                    animationState="running-left"
                    className="decision-showcase__collider-sprite"
                    elapsedMs={visualElapsedMs}
                    imageUrl={SPRITE_URL}
                    scale={0.54}
                    size={SPRITE_SIZE}
                  />
                </span>
                <span
                  aria-hidden="true"
                  className="decision-showcase__impact-effect"
                  data-testid="decision-impact-effect"
                  key={`impact-${motionSequence}`}
                />
              </>
            ) : null}
          </div>
          <div
            className="decision-showcase__selection-reserve"
            data-active={shouldShowSelectionReel ? "true" : "false"}
          >
            {explanation.selection && shouldShowSelectionReel ? (
              <DecisionSelectionPrototype
                motionSequence={motionSequence}
                onSelectionSettled={handleSelectionSettled}
                probabilityProgress={probabilityProgress}
                selection={explanation.selection}
              />
            ) : null}
          </div>
          <dl className="decision-showcase__stats">
            <div>
              <dt>Intent</dt>
              <dd>{selectedPet.intent}</dd>
            </div>
            <div>
              <dt>Locomotion</dt>
              <dd>{selectedPet.locomotion}</dd>
            </div>
            <div>
              <dt>Speech</dt>
              <dd>{selectedPet.speech ?? "quiet"}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                {Math.round(selectedPet.position.x)},{" "}
                {Math.round(selectedPet.position.y)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="decision-showcase__controls">
          <div className="decision-showcase__stimuli">
            <h2>Inject event</h2>
            <div className="decision-showcase__button-row">
              {AGENT_STIMULI.map((stimulus) => (
                <Button
                  key={stimulus.type}
                  onClick={() => handleAgentStimulus(stimulus.type, stimulus.summary)}
                  size="sm"
                  variant={stimulus.type === "task.failed" ? "accent" : "neutral"}
                >
                  {stimulus.label}
                </Button>
              ))}
              <Button onClick={handleCollisionStimulus} size="sm" variant="neutral">
                Collision
              </Button>
              <Button onClick={handleAutonomousStimulus} size="sm" variant="neutral">
                Autonomous roll
              </Button>
            </div>
          </div>

        </section>
      </div>
    </section>
  );
}

function DecisionSelectionPrototype({
  motionSequence,
  onSelectionSettled,
  probabilityProgress,
  selection,
}: DecisionSelectionPrototypeProps) {
  const candidates = selectionSlotCandidates(selection);
  const reelCandidates = Array.from({ length: SLOT_REEL_COPY_SETS }, () => candidates).flat();
  const selectedIndex = Math.max(
    0,
    candidates.findIndex((candidate) => candidate.selected),
  );
  const selectedCandidate = candidates[selectedIndex];
  const reelMotion = useSelectionReelMotion({
    itemCount: candidates.length,
    motionSequence,
    selectedIndex,
  });
  const trackStyle = {
    transform: `translateX(${-reelMotion.offset}px)`,
  } as CSSProperties;

  useEffect(() => {
    if (reelMotion.phase !== "settled") return;
    onSelectionSettled(selection.selectedKind);
  }, [onSelectionSettled, reelMotion.phase, selection.selectedKind]);

  return (
    <div
      className="decision-showcase__selection-slot"
      data-mode="slot-machine"
      data-motion-sequence={motionSequence}
      data-testid="decision-selection-slot"
      key={`selection-${motionSequence}`}
    >
      <div
        className="decision-showcase__selection-reel"
        data-animation="infinite-to-stop"
        data-probability-ready={probabilityProgress >= 1 ? "true" : "false"}
        data-spin-ms={SLOT_REEL_SPIN_MS}
        data-spin-phase={reelMotion.phase}
        data-spin-profile="exponential"
        data-stop-ms={SLOT_REEL_STOP_MS}
        data-stop-kind={selectedCandidate?.kind ?? ""}
        data-testid="decision-selection-reel"
      >
        <div className="decision-showcase__selection-track" style={trackStyle}>
          {reelCandidates.map((candidate, index) => {
            const setIndex = Math.floor(index / candidates.length);
            const itemIndex = index % candidates.length;
            const isCopy = setIndex !== SLOT_REEL_ORIGINAL_SET_INDEX;
            return (
              <SelectionReelItem
                candidate={candidate}
                index={index}
                isCopy={isCopy}
                key={`${candidate.kind}-${setIndex}-${itemIndex}`}
                probabilityProgress={probabilityProgress}
                revealSelection={reelMotion.phase === "settled"}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useSelectionReelMotion({
  itemCount,
  motionSequence,
  selectedIndex,
}: {
  itemCount: number;
  motionSequence: number;
  selectedIndex: number;
}) {
  const stepWidth = SLOT_CARD_WIDTH + SLOT_REEL_GAP;
  const cycleWidth = itemCount * stepWidth;
  const baseOffset =
    cycleWidth * (SLOT_REEL_ORIGINAL_SET_INDEX - 2) + selectedIndex * stepWidth;
  const selectedOffset = cycleWidth * SLOT_REEL_ORIGINAL_SET_INDEX + selectedIndex * stepWidth;
  const [motion, setMotion] = useState({
    offset: baseOffset,
    phase: "preview" as "preview" | "spinning" | "stopping" | "settled",
  });

  useEffect(() => {
    let animationFrameId = 0;
    let startedAt: number | null = null;
    const stopStartOffset = baseOffset + SLOT_REEL_SPIN_DISTANCE_PX;
    const stopDistance = selectedOffset - stopStartOffset;

    function update(timestamp: number) {
      startedAt ??= timestamp;
      const elapsed = timestamp - startedAt;

      if (elapsed < SLOT_REEL_PREVIEW_MS) {
        setMotion({
          offset: baseOffset,
          phase: "preview",
        });
        animationFrameId = window.requestAnimationFrame(update);
        return;
      }

      const spinElapsed = elapsed - SLOT_REEL_PREVIEW_MS;
      if (spinElapsed < SLOT_REEL_SPIN_MS) {
        const progress = spinElapsed / SLOT_REEL_SPIN_MS;
        setMotion({
          offset: baseOffset + SLOT_REEL_SPIN_DISTANCE_PX * exponentialSpinProgress(progress),
          phase: "spinning",
        });
        animationFrameId = window.requestAnimationFrame(update);
        return;
      }

      const stopElapsed = Math.min(SLOT_REEL_STOP_MS, spinElapsed - SLOT_REEL_SPIN_MS);
      const progress = stopElapsed / SLOT_REEL_STOP_MS;
      const easedProgress = 1 - (1 - progress) ** 3;
      const offset = stopStartOffset + stopDistance * easedProgress;
      setMotion({
        offset,
        phase: progress >= 1 ? "settled" : "stopping",
      });

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(update);
      }
    }

    setMotion({
      offset: baseOffset,
      phase: "preview",
    });
    animationFrameId = window.requestAnimationFrame(update);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [baseOffset, motionSequence, selectedOffset]);

  return motion;
}

function exponentialSpinProgress(progress: number) {
  const boundedProgress = Math.max(0, Math.min(1, progress));
  const scale = Math.exp(SLOT_REEL_SPIN_EXPONENT) - 1;
  return (Math.exp(SLOT_REEL_SPIN_EXPONENT * boundedProgress) - 1) / scale;
}

function SelectionReelItem({
  candidate,
  index,
  isCopy,
  probabilityProgress,
  revealSelection,
}: {
  candidate: SelectionCandidateView;
  index: number;
  isCopy: boolean;
  probabilityProgress: number;
  revealSelection: boolean;
}) {
  const isSelectedStop = candidate.selected && !isCopy;
  const isSelectionVisible = isSelectedStop && revealSelection;
  const pingDelay = 42 * (index % 5);

  return (
    <article
      className="decision-showcase__selection-reel-item"
      data-reel-copy={isCopy ? "true" : undefined}
      data-selected={isSelectionVisible ? "true" : "false"}
      data-slot-index={index}
      data-slot-stop={isSelectedStop ? "center" : undefined}
      data-testid="decision-selection-reel-item"
      style={
        {
          "--slot-ping-delay": `${pingDelay}ms`,
        } as CSSProperties
      }
    >
      <strong>{candidate.kind}</strong>
      <span>{formatPercent(candidate.probability * probabilityProgress)}</span>
    </article>
  );
}

function animationStateForPet(
  pet: PetSnapshot,
  settledDecisionKind: BehaviorDecisionKind | null,
): PetAnimationState {
  const decisionAnimation = animationStateForDecisionKind(settledDecisionKind);
  if (decisionAnimation) return decisionAnimation;
  if (pet.pendingReaction) return "waiting";
  if (pet.agentTask?.status === "failed") return "failed";
  if (pet.agentTask?.status === "waiting") return "waiting";
  if (pet.agentTask?.status === "completed") return "review";
  if (pet.action?.startsWith("jump")) return "jumping";
  if (pet.motionTarget) return "running-right";
  return "idle";
}

function animationStateForDecisionKind(
  kind: BehaviorDecisionKind | null,
): PetAnimationState | null {
  switch (kind) {
    case "request-jump":
    case "collision-jump":
      return "jumping";
    case "request-climb":
      return "running";
    case "wander-near":
    case "wander-far":
    case "seek-user":
    case "approach-pet":
    case "collision-engage":
    case "collision-avoid":
      return "running-right";
    case "flee-from-pet":
    case "collision-flee":
      return "running-left";
    case "idle-stay":
    case "collision-stay":
    case "collision-unfazed":
      return "idle";
    default:
      return null;
  }
}

function summarizePersonality(personality: PersonalityComponent | undefined) {
  if (!personality) return "Unknown temperament";
  if (personality.extraversion >= 0.75 && personality.openness >= 0.6) {
    return "Curious extrovert";
  }
  if (personality.neuroticism >= 0.65 && personality.extraversion <= 0.35) {
    return "Reserved";
  }
  if (personality.agreeableness >= 0.7 && personality.extraversion >= 0.55) {
    return "Sociable";
  }
  if (personality.conscientiousness >= 0.65) return "Steady";
  if (personality.openness >= 0.65) return "Curious";
  if (personality.neuroticism >= 0.65) return "Cautious";
  if (personality.extraversion >= 0.65) return "Outgoing";
  return "Balanced";
}

function selectionSlotCandidates(selection: DecisionSelectionExplanation) {
  const ranked = [...selection.candidates].sort(
    (left, right) => right.probability - left.probability,
  );
  const visible = ranked.slice(0, 5);
  const selected = selection.candidates.find((candidate) => candidate.selected);
  if (selected && !visible.some((candidate) => candidate.kind === selected.kind)) {
    visible[visible.length - 1] = selected;
  }
  return visible;
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
