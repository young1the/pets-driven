import { useEffect, useRef, useState } from "react";
import { createDemoScenario } from "@/core/world/scenario-fixtures";
import { drawWorld } from "./canvas-renderer";
import { PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");

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

  function sendWaitingStimulus() {
    scenarioRef.current.world.pushStimulus({
      type: "task.waiting",
      sourceId: "agent-a",
      at: scenarioRef.current.clock.now(),
      summary: "Approve command",
    });
    setLastStimulus("task.waiting");
  }

  return (
    <main className="playground-shell">
      <header>
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
      <ScenarioControls lastStimulus={lastStimulus} onSendWaiting={sendWaitingStimulus} />
      <canvas ref={canvasRef} data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
