import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@pets-driven/design-system";
import { createDemoScenario } from "@/core/scenario-fixtures";
import { PetSprite } from "@/pets/rendering/pet-sprite";
import type { PetAnimationState } from "@/pets/assets/pet-atlas";
import type { PetSnapshot } from "@/core/world-snapshot";
import {
  applyCollisionDecisionStimulus,
  createAgentDecisionStimulus,
  explainDecisionPipeline,
  type DecisionStimulus,
} from "./decision-showcase-adapter";

const STEP_MS = 16;
const PRIMARY_PET_ID = "pet-a";
const COLLIDER_PET_ID = "pet-b";
const SPRITE_URL = "/fallback-pets/patamon/spritesheet.webp";
const SPRITE_SIZE = { width: 192, height: 208 };
const VISUAL_TICK_MS = 120;
const MOTION_RESET_MS = 980;

type DecisionTraceEntry = {
  stimulus: string;
  source: string;
  decision: string;
  intent: string;
};

type ShowcaseMotion = "idle" | "agent" | "collision";

const PERSONALITY_AXES = [
  { key: "openness", label: "O" },
  { key: "conscientiousness", label: "C" },
  { key: "extraversion", label: "E" },
  { key: "agreeableness", label: "A" },
  { key: "neuroticism", label: "N" },
] as const;

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
  const [trace, setTrace] = useState<DecisionTraceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [visualTick, setVisualTick] = useState(0);
  const [stageMotion, setStageMotion] = useState<ShowcaseMotion>("idle");
  const [motionSequence, setMotionSequence] = useState(0);
  const motionResetRef = useRef<number | null>(null);

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
    },
    [],
  );

  const selectedPet =
    snapshot.pets.find((pet) => pet.id === PRIMARY_PET_ID) ?? snapshot.pets[0];
  const personality = selectedPet
    ? scenarioRef.current.world.getComponent(selectedPet.id, "Personality")
    : undefined;
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

  function advanceFrame(count = 1) {
    for (let index = 0; index < count; index += 1) {
      scenarioRef.current.clock.advanceBy(STEP_MS);
      scenarioRef.current.world.step(STEP_MS);
    }
    setElapsedMs((current) => current + STEP_MS * count);
    setSnapshot(scenarioRef.current.world.snapshot());
  }

  function recordTrace(stimulus: DecisionStimulus) {
    const pet =
      scenarioRef.current.world.snapshot().pets.find((entry) => entry.id === PRIMARY_PET_ID) ??
      selectedPet;
    const decision = scenarioRef.current.world.getComponent(
      PRIMARY_PET_ID,
      "BehaviorDecisionState",
    );
    const token = scenarioRef.current.world.getComponent(
      PRIMARY_PET_ID,
      "BehaviorDecisionToken",
    );
    const intent = scenarioRef.current.world.getComponent(PRIMARY_PET_ID, "IntentState");
    setTrace((current) =>
      [
        {
          stimulus: stimulus.label,
          source: decision?.source ?? pet?.pendingReaction?.source ?? "none",
          decision: pet?.pendingReaction ? "deliberating" : (token?.kind ?? "none"),
          intent: intent?.intent ?? pet?.intent ?? "none",
        },
        ...current,
      ].slice(0, 6),
    );
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
    recordTrace(result.stimulus);
  }

  function handleCollisionStimulus() {
    expireActiveClaim();
    const result = applyCollisionDecisionStimulus({
      colliderPetId: COLLIDER_PET_ID,
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
    recordTrace(result.stimulus);
  }

  function handleAutonomousStimulus() {
    expireActiveClaim();
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "BehaviorDecisionState");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "BehaviorDecisionToken");
    scenarioRef.current.world.removeComponent(PRIMARY_PET_ID, "PendingReaction");
    scenarioRef.current.world.setComponent(PRIMARY_PET_ID, {
      type: "IntentState",
      intent: "idle",
    });
    scenarioRef.current.world.setComponent(PRIMARY_PET_ID, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: null,
    });

    const stimulus: DecisionStimulus = {
      channel: "autonomous",
      label: "autonomous roll",
      detail: "BehaviorDecisionSystem softmax candidate pool",
    };

    setError(null);
    setLastStimulus(stimulus);
    playStageMotion("agent");
    advanceFrame();
    recordTrace(stimulus);
  }

  function expireActiveClaim() {
    const decision = scenarioRef.current.world.getComponent(
      PRIMARY_PET_ID,
      "BehaviorDecisionState",
    );
    const now = scenarioRef.current.clock.now();
    if (!decision || decision.expiresAt <= now) return;

    const frames = Math.ceil((decision.expiresAt - now + STEP_MS) / STEP_MS);
    advanceFrame(frames);
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
            <strong>{selectedPet.name}</strong>
          </div>
          <div className="decision-showcase__pet">
            {stageMotion === "agent" ? (
              <span
                aria-hidden="true"
                className="decision-showcase__agent-pulse"
                data-testid="decision-agent-pulse"
                key={`agent-pulse-${motionSequence}`}
              />
            ) : null}
            <PetSprite
              alt={`${selectedPet.name} sprite`}
              animationState={animationStateForPet(selectedPet)}
              className="decision-showcase__live-sprite"
              elapsedMs={visualElapsedMs}
              imageUrl={SPRITE_URL}
              overlay={overlayForPet(selectedPet)}
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
          <section className="decision-showcase__personality">
            <h2>Personality</h2>
            <dl>
              {PERSONALITY_AXES.map((axis) => (
                <div key={axis.key}>
                  <dt>{axis.label}</dt>
                  <dd>{formatPersonalityAxis(personality?.[axis.key] ?? 0)}</dd>
                </div>
              ))}
            </dl>
          </section>
          {explanation.selection ? (
            <section
              className="decision-showcase__stage-softmax"
              data-testid="decision-softmax-roll"
            >
              <header>
                <h2>Softmax roll</h2>
                <dl>
                  <div>
                    <dt>Random roll</dt>
                    <dd>{formatPercent(explanation.selection.randomRoll)}</dd>
                  </div>
                  <div>
                    <dt>T</dt>
                    <dd>{formatNumber(explanation.selection.temperature)}</dd>
                  </div>
                </dl>
              </header>
              <div
                aria-label={`Random roll ${formatPercent(explanation.selection.randomRoll)}`}
                className="decision-showcase__roll-rail"
              >
                <span
                  data-testid="decision-roll-marker"
                  style={{ left: formatPercent(explanation.selection.randomRoll) }}
                />
              </div>
              <div className="decision-showcase__stage-softmax-list">
                {explanation.selection.candidates.map((candidate) => (
                  <article
                    className="decision-showcase__stage-softmax-row"
                    data-selected={candidate.selected}
                    key={candidate.kind}
                  >
                    <strong>{candidate.kind}</strong>
                    <span>Probability</span>
                    <div className="decision-showcase__stage-softmax-bar">
                      <i style={{ width: formatPercent(candidate.probability) }} />
                    </div>
                    <span>{formatPercent(candidate.probability)}</span>
                    {candidate.selected ? <em>winner</em> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
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

          <div className="decision-showcase__pipeline">
            {explanation.steps.map((step) => (
              <article
                className="decision-showcase__step"
                data-status={step.status}
                key={step.id}
              >
                <span>{step.title}</span>
                <strong>{step.value}</strong>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>

          <section className="decision-showcase__trace">
            <h2>Decision trace</h2>
            {trace.length === 0 ? (
              <p>No stimulus yet.</p>
            ) : (
              <ul>
                {trace.map((entry, index) => (
                  <li key={`${entry.stimulus}-${index}`}>
                    <span>{entry.stimulus}</span>
                    <span>{entry.source}</span>
                    <span>{entry.decision}</span>
                    <span>{entry.intent}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
    </section>
  );
}

function animationStateForPet(pet: PetSnapshot): PetAnimationState {
  if (pet.pendingReaction) return "waiting";
  if (pet.heldAgentState?.kind === "failed") return "failed";
  if (pet.heldAgentState?.kind === "waiting") return "waiting";
  if (pet.heldAgentState?.kind === "completed") return "review";
  if (pet.action?.startsWith("jump")) return "jumping";
  if (pet.motionTarget) return "running-right";
  return "idle";
}

function overlayForPet(pet: PetSnapshot) {
  if (pet.pendingReaction) {
    return { kind: "attention" as const, label: "Collision" };
  }
  if (pet.heldAgentState?.kind === "failed") {
    return { kind: "status" as const, label: "Failed" };
  }
  if (pet.heldAgentState?.kind === "waiting") {
    return { kind: "attention" as const, label: "Waiting" };
  }
  if (pet.heldAgentState?.kind === "completed") {
    return { kind: "status" as const, label: "Done" };
  }
  return null;
}

function formatNumber(value: number) {
  return value.toFixed(3);
}

function formatPersonalityAxis(value: number) {
  return Math.round(value * 100);
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
