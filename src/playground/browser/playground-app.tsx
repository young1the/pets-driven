import { createAgentEvent, type AgentEvent } from "@/adapters/agent-events/agent-event";
import { toStimulus } from "@/adapters/agent-events/agent-event-adapter";
import { useEffect, useRef, useState } from "react";
import { createDemoScenario } from "@/core/world/scenario-fixtures";
import { AgentEventPanel } from "./agent-event-panel";
import { drawWorld } from "./canvas-renderer";
import { PLAYGROUND_SAMPLE_EVENT_SUMMARIES, PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const intervalId = window.setInterval(() => {
      scenarioRef.current.clock.advanceBy(16);
      scenarioRef.current.world.step(16);
      drawWorld(
        context,
        scenarioRef.current.world.snapshot(),
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
    setLastStimulus(type);
    setLastEvent(event);
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
      />
      <AgentEventPanel event={lastEvent} />
      <canvas ref={canvasRef} data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
