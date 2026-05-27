import { useCallback, useEffect, useRef, useState } from "react";
import { createDemoScenario } from "@/core/scenario-fixtures";
import { BehaviorLab } from "./behavior-lab";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import { PLAYGROUND_TEXT } from "./playground-text";
import { ScenarioControls } from "./scenario-controls";
import { loadPlaygroundPetAssetCatalog } from "@/pets/assets/codex-pet-fixtures";
import type { AssetCatalog } from "./canvas-renderer";

type Snapshot = ReturnType<
  ReturnType<typeof createDemoScenario>["world"]["snapshot"]
>;

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [selectedPetId, setSelectedPetId] = useState("pet-a");
  const [snapshot, setSnapshot] = useState(() =>
    scenarioRef.current.world.snapshot(),
  );
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [frameNumber, setFrameNumber] = useState(0);
  const [assets, setAssets] = useState<AssetCatalog>({});

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
    function pushKeyboardEvent(
      event: KeyboardEvent,
      type: "keyboard.down" | "keyboard.up",
    ) {
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

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / rect.width;
    const scaleY = event.currentTarget.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
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
    <main className="playground-shell">
      <header>
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
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
            width={960}
            height={540}
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
        <BehaviorLab
          pets={snapshot.pets}
          selectedPetId={selectedPetId}
          onSelectPet={setSelectedPetId}
          getComponent={(id, type) =>
            scenarioRef.current.world.getComponent(id, type)
          }
        />
      </div>
    </main>
  );
}
