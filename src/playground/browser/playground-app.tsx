import { createAgentEvent, type AgentEvent } from "@/adapters/agent-events/agent-event";
import { toStimulus } from "@/adapters/agent-events/agent-event-adapter";
import { useEffect, useRef, useState } from "react";
import { createDemoScenario } from "@/core/world/scenario-fixtures";
import { AgentEventPanel } from "./agent-event-panel";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import { PLAYGROUND_SAMPLE_EVENT_SUMMARIES, PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
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
      activeMode: "walk",
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
      />
      <AgentEventPanel event={lastEvent} />
      <PetStatusList pets={snapshot.pets} />
      <canvas ref={canvasRef} data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
