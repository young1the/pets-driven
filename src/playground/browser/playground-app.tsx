import { createAgentEvent, type AgentEvent } from "@/adapters/agent-events/agent-event";
import { toStimulus } from "@/adapters/agent-events/agent-event-adapter";
import { useEffect, useRef, useState } from "react";
import { createDemoScenario } from "@/core/world/scenario-fixtures";
import { AgentEventPanel } from "./agent-event-panel";
import { BehaviorLab } from "./behavior-lab";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import { PLAYGROUND_SAMPLE_EVENT_SUMMARIES, PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
  const [selectedPetId, setSelectedPetId] = useState("pet-a");
  const [snapshot, setSnapshot] = useState(() => scenarioRef.current.world.snapshot());

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const intervalId = window.setInterval(() => {
      scenarioRef.current.clock.advanceBy(16);
      scenarioRef.current.world.step(16);
      const nextSnapshot = scenarioRef.current.world.snapshot();
      setSnapshot(nextSnapshot);
      drawWorld(
        context,
        nextSnapshot,
        {},
        scenarioRef.current.clock.now(),
      );
    }, 16);

    return () => window.clearInterval(intervalId);
  }, []);

  function sendEvent(type: AgentEvent["type"], summary: string) {
    const event = createAgentEvent({
      type,
      sourceId: "agent-a",
      at: scenarioRef.current.clock.now(),
      summary,
    });

    scenarioRef.current.world.pushStimulus(toStimulus(event));
    scenarioRef.current.world.step(0);
    setSnapshot(scenarioRef.current.world.snapshot());
    setLastStimulus(type);
    setLastEvent(event);
  }

  function startWalkDemo() {
    const alice = snapshot.pets.find((pet) => pet.id === "pet-a");
    scenarioRef.current.world.setComponent("pet-a", {
      type: "LocomotionState",
      baseMode: "walk",
    });
    scenarioRef.current.world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: {
        x: 820,
        y: alice?.position.y ?? 200,
      },
    });
    scenarioRef.current.world.setComponent("pet-a", {
      type: "SpeechState",
      speech: PLAYGROUND_TEXT.walkingDemoSpeech,
    });

    scenarioRef.current.world.step(0);
    setSnapshot(scenarioRef.current.world.snapshot());
    setLastStimulus(PLAYGROUND_TEXT.walkDemoStimulus);
  }

  function startJumpDemo() {
    scenarioRef.current.world.setComponent("pet-a", {
      type: "LocomotionState",
      baseMode: "walk",
    });
    scenarioRef.current.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
    scenarioRef.current.world.setComponent("pet-a", {
      type: "SpeechState",
      speech: PLAYGROUND_TEXT.jumpDemoSpeech,
    });

    scenarioRef.current.world.step(0);
    setSnapshot(scenarioRef.current.world.snapshot());
    setLastStimulus(PLAYGROUND_TEXT.jumpDemoStimulus);
  }

  function startWallClimbDemo() {
    scenarioRef.current.world.setComponent("pet-a", {
      type: "LocomotionState",
      baseMode: "walk",
    });
    scenarioRef.current.world.setComponent("pet-a", {
      type: "ClimbIntentState",
      phase: "approaching",
      surfaceEntityId: "alice-climb-wall",
      targetY: 120,
    });
    scenarioRef.current.world.setComponent("pet-a", {
      type: "SpeechState",
      speech: PLAYGROUND_TEXT.wallClimbDemoSpeech,
    });

    scenarioRef.current.world.step(0);
    setSnapshot(scenarioRef.current.world.snapshot());
    setLastStimulus(PLAYGROUND_TEXT.wallClimbDemoStimulus);
  }

  return (
    <main className="playground-shell">
      <header>
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
      <ScenarioControls
        lastStimulus={lastStimulus}
        onSendStarted={() => sendEvent("task.started", PLAYGROUND_SAMPLE_EVENT_SUMMARIES.started)}
        onSendWaiting={() => sendEvent("task.waiting", PLAYGROUND_SAMPLE_EVENT_SUMMARIES.waiting)}
        onSendCompleted={() =>
          sendEvent("task.completed", PLAYGROUND_SAMPLE_EVENT_SUMMARIES.completed)
        }
        onStartWalkDemo={startWalkDemo}
        onStartJumpDemo={startJumpDemo}
        onStartWallClimbDemo={startWallClimbDemo}
      />
      <AgentEventPanel event={lastEvent} />
      <div className="playground-workspace">
        <div className="playground-stage">
          <canvas ref={canvasRef} data-testid="world-canvas" width={960} height={540} />
          <PetStatusList pets={snapshot.pets} />
        </div>
        <BehaviorLab
          pets={snapshot.pets}
          selectedPetId={selectedPetId}
          onSelectPet={setSelectedPetId}
          getComponent={(id, type) => scenarioRef.current.world.getComponent(id, type)}
        />
      </div>
    </main>
  );
}
