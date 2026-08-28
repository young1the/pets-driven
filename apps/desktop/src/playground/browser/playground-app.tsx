import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { loadPlaygroundPetAssetCatalog } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import type { AssetCatalog } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentEvent, createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { createAgentEventFromHook } from "@/adapters/agent-events/agent-hook-adapter";
import type { ClaudeHookEventName } from "@/adapters/agent-events/claude-hook-adapter";
import { AgentEventPanel } from "./agent-event-panel";
import { BehaviorLab } from "./behavior-lab";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import { PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

export function PlaygroundApp() {
  return (
    <main className="playground-shell">
      <header className="playground-shell__header">
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
      <DemoPlaygroundView />
    </main>
  );
}

export function DemoPlaygroundView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The demo always runs the dual-monitor world so pet projection is exercised
  // across a monitor seam; there is no single-monitor variant to toggle to.
  const scenarioRef = useRef(createDemoScenario({ monitorLayout: "dual-horizontal", ball: true }));
  const [selectedPetId, setSelectedPetId] = useState("pet-a");
  const [snapshot, setSnapshot] = useState(() => scenarioRef.current.world.snapshot());
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [frameNumber, setFrameNumber] = useState(0);
  const [assets, setAssets] = useState<AssetCatalog>({});
  const [lastAgentEvent, setLastAgentEvent] = useState<AgentEvent | null>(null);
  const [lastHookName, setLastHookName] = useState<ClaudeHookEventName | null>(null);
  const [agentEventError, setAgentEventError] = useState<string | null>(null);

  const advanceFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || typeof context.clearRect !== "function") {
      return;
    }

    scenarioRef.current.clock.advanceBy(16);
    scenarioRef.current.world.step(16);
    const nextSnapshot = scenarioRef.current.world.snapshot();
    setSnapshot(nextSnapshot);
    setFrameNumber((prev) => prev + 1);
    drawWorld(context, nextSnapshot, assets, scenarioRef.current.clock.now());
  }, [assets]);

  useEffect(() => {
    let isMounted = true;

    loadPlaygroundPetAssetCatalog()
      .then((catalog) => {
        if (isMounted) {
          setAssets(catalog);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAssets({});
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAnimationPlaying) {
      return;
    }

    const intervalId = window.setInterval(advanceFrame, 16);
    return () => window.clearInterval(intervalId);
  }, [advanceFrame, isAnimationPlaying]);

  useEffect(() => {
    function pushKeyboardEvent(event: KeyboardEvent, type: "keyboard.down" | "keyboard.up") {
      scenarioRef.current.world.pushEvent({
        kind: "keyboard",
        type,
        key: event.key,
        code: event.code,
        at: scenarioRef.current.clock.now(),
        repeat: event.repeat,
      });
    }

    const down = (event: KeyboardEvent) => pushKeyboardEvent(event, "keyboard.down");
    const up = (event: KeyboardEvent) => pushKeyboardEvent(event, "keyboard.up");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const pushAgentEvent = useCallback((agentEvent: AgentEvent) => {
    scenarioRef.current.world.pushEvent(toWorldEvent(agentEvent));
    setLastAgentEvent(agentEvent);
    setAgentEventError(null);
  }, []);

  const handleClaudeHookPayload = useCallback(
    (payload: unknown) => {
      try {
        const agentEvent = createAgentEventFromHook(
          { provider: "claude", payload },
          {
            defaultSourceId: selectedPetId === "pet-b" ? "agent-b" : "agent-a",
            now: scenarioRef.current.clock.now(),
          },
        );
        setLastHookName(
          (payload as { hook_event_name?: ClaudeHookEventName }).hook_event_name ?? null,
        );
        pushAgentEvent(agentEvent);
      } catch (error) {
        setAgentEventError(error instanceof Error ? error.message : String(error));
      }
    },
    [pushAgentEvent, selectedPetId],
  );

  const handleAgentEventInput = useCallback(
    (input: unknown) => {
      try {
        const agentEvent = createAgentEvent(
          input as {
            type: string;
            sourceId: string;
            at: number;
            summary?: string;
          },
        );
        setLastHookName(null);
        pushAgentEvent(agentEvent);
      } catch (error) {
        setAgentEventError(error instanceof Error ? error.message : String(error));
      }
    },
    [pushAgentEvent],
  );

  useEffect(() => {
    const handleClaudeHook = (event: Event) => {
      handleClaudeHookPayload((event as CustomEvent).detail);
    };
    const handleAgentEvent = (event: Event) => {
      handleAgentEventInput((event as CustomEvent).detail);
    };

    window.addEventListener("pets-driven:claude-hook", handleClaudeHook);
    window.addEventListener("pets-driven:agent-event", handleAgentEvent);
    return () => {
      window.removeEventListener("pets-driven:claude-hook", handleClaudeHook);
      window.removeEventListener("pets-driven:agent-event", handleAgentEvent);
    };
  }, [handleAgentEventInput, handleClaudeHookPayload]);

  function sendSampleHook(hookEventName: ClaudeHookEventName, tool?: string) {
    handleClaudeHookPayload({
      hook_event_name: hookEventName,
      sourceId: selectedPetId === "pet-b" ? "agent-b" : "agent-a",
      at: scenarioRef.current.clock.now(),
      // Omitted on purpose for the "Tool: ?" sample: an agent that reports no
      // tool name (Codex) must still work, with the pet keeping its own pose.
      tool_name: tool,
    });
    advanceFrame();
  }

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / rect.width;
    const scaleY = event.currentTarget.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX + (snapshot.viewport?.x ?? 0),
      y: (event.clientY - rect.top) * scaleY + (snapshot.viewport?.y ?? 0),
    };
  }

  function pushPointerEvent(
    event: React.PointerEvent<HTMLCanvasElement>,
    type: "pointer.down" | "pointer.move" | "pointer.up",
  ) {
    scenarioRef.current.world.pushEvent({
      kind: "pointer",
      type,
      pointerId: event.pointerId,
      at: scenarioRef.current.clock.now(),
      position: canvasPoint(event),
      button: event.button,
    });
  }

  return (
    <section className="playground-demo-view">
      <ScenarioControls
        isAnimationPlaying={isAnimationPlaying}
        frameNumber={frameNumber}
        onToggleAnimation={() => setIsAnimationPlaying((prev) => !prev)}
        onPlayNextFrame={advanceFrame}
      />
      <div className="playground-workspace">
        <div className="playground-stage">
          <canvas
            ref={canvasRef}
            data-testid="world-canvas"
            width={snapshot.width}
            height={snapshot.height}
            style={{ aspectRatio: `${snapshot.width} / ${snapshot.height}` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              pushPointerEvent(event, "pointer.down");
            }}
            onPointerMove={(event) => pushPointerEvent(event, "pointer.move")}
            onPointerUp={(event) => {
              pushPointerEvent(event, "pointer.up");
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
          />
          <PetStatusList pets={snapshot.pets} />
        </div>
        <aside className="playground-sidebar">
          <AgentEventPanel
            lastEvent={lastAgentEvent}
            lastHookName={lastHookName}
            error={agentEventError}
            onSendSampleHook={sendSampleHook}
          />
          <BehaviorLab
            pets={snapshot.pets}
            selectedPetId={selectedPetId}
            onSelectPet={setSelectedPetId}
            getComponent={(id, type) => scenarioRef.current.world.getComponent(id, type)}
          />
        </aside>
      </div>
    </section>
  );
}
