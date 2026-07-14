import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { loadPlaygroundPetAssetCatalog } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import type { AssetCatalog } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentEvent, createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import {
  type ClaudeHookEventName,
  createAgentEventFromClaudeHook,
} from "@/adapters/agent-events/claude-hook-adapter";
import { AgentEventPanel } from "./agent-event-panel";
import { BehaviorLab } from "./behavior-lab";
import { drawWorld } from "./canvas-renderer";
import { ClimbPlaygroundApp } from "./climb-playground-app";
import { DecisionShowcaseApp } from "./decision-showcase-app";
import { JumpPlaygroundApp } from "./jump-playground-app";
import { PetStatusList } from "./pet-status-list";
import { PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

type PlaygroundViewId = "demo" | "jump" | "climb" | "decision";
type PlaygroundViewGroup = "Simulation";

type PlaygroundView = {
  id: PlaygroundViewId;
  group: PlaygroundViewGroup;
  label: string;
  Component: () => JSX.Element | null;
};

const PLAYGROUND_VIEWS: PlaygroundView[] = [
  { id: "demo", group: "Simulation", label: "Demo", Component: DemoPlaygroundView },
  { id: "jump", group: "Simulation", label: "Jump", Component: JumpPlaygroundApp },
  { id: "climb", group: "Simulation", label: "Climb", Component: ClimbPlaygroundApp },
  { id: "decision", group: "Simulation", label: "Decision", Component: DecisionShowcaseApp },
];

const PLAYGROUND_GROUPS: PlaygroundViewGroup[] = ["Simulation"];

function getViewFromHash(): PlaygroundViewId {
  const hash = window.location.hash.replace(/^#/, "");
  return isPlaygroundViewId(hash) ? hash : "demo";
}

function isPlaygroundViewId(value: string): value is PlaygroundViewId {
  return PLAYGROUND_VIEWS.some((view) => view.id === value);
}

export function PlaygroundApp() {
  const [activeViewId, setActiveViewId] = useState<PlaygroundViewId>(() => getViewFromHash());
  const activeView =
    PLAYGROUND_VIEWS.find((view) => view.id === activeViewId) ?? PLAYGROUND_VIEWS[0];
  const ActiveView = activeView.Component;

  useEffect(() => {
    const handleHashChange = () => setActiveViewId(getViewFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function selectView(viewId: PlaygroundViewId) {
    setActiveViewId(viewId);
    const nextHash = `#${viewId}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = viewId;
    }
  }

  return (
    <main className="playground-shell playground-hub">
      <header className="playground-hub__header">
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
      <nav className="playground-hub__nav" aria-label="Playground views">
        {PLAYGROUND_GROUPS.map((group) => (
          <div
            key={group}
            className="playground-hub__group"
            role="tablist"
            aria-label={`${group} playgrounds`}
          >
            <span className="playground-hub__group-label">{group}</span>
            <div className="playground-hub__tabs">
              {PLAYGROUND_VIEWS.filter((view) => view.group === group).map((view) => (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={view.id === activeViewId}
                  aria-controls={`playground-view-${view.id}`}
                  className="playground-hub__tab"
                  onClick={() => selectView(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div
        id={`playground-view-${activeView.id}`}
        className="playground-hub__view"
        role="tabpanel"
        aria-label={activeView.label}
      >
        <ActiveView key={activeView.id} />
      </div>
    </main>
  );
}

export function DemoPlaygroundView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [monitorLayout, setMonitorLayout] = useState<"single" | "dual-horizontal">("single");
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

  const selectMonitorLayout = useCallback((layout: "single" | "dual-horizontal") => {
    const scenario = createDemoScenario({ monitorLayout: layout });
    scenarioRef.current = scenario;
    setMonitorLayout(layout);
    setSelectedPetId("pet-a");
    setSnapshot(scenario.world.snapshot());
    setFrameNumber(0);
  }, []);

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
        const agentEvent = createAgentEventFromClaudeHook(payload, {
          defaultSourceId: selectedPetId === "pet-b" ? "agent-b" : "agent-a",
          now: scenarioRef.current.clock.now(),
        });
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

  function sendSampleHook(hookEventName: ClaudeHookEventName) {
    handleClaudeHookPayload({
      hook_event_name: hookEventName,
      sourceId: selectedPetId === "pet-b" ? "agent-b" : "agent-a",
      at: scenarioRef.current.clock.now(),
      tool_name: hookEventName.includes("Tool") ? "Bash" : undefined,
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
        monitorLayout={monitorLayout}
        onToggleAnimation={() => setIsAnimationPlaying((prev) => !prev)}
        onPlayNextFrame={advanceFrame}
        onSelectMonitorLayout={selectMonitorLayout}
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
