import { Button } from "@pets-driven/design-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClimbPlaygroundScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import { loadPlaygroundPetAssetCatalog } from "@pets-driven/pet-engine/pets/assets/codex-pet-fixtures";
import type { AssetCatalog } from "@pets-driven/pet-engine/pets/rendering/pet-sprite-canvas";

type ClimbScenario = ReturnType<typeof createClimbPlaygroundScenario>;

export function ClimbPlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createClimbPlaygroundScenario());
  const [snapshot, setSnapshot] = useState(() => scenarioRef.current.world.snapshot());
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [frameNumber, setFrameNumber] = useState(0);
  const [assets, setAssets] = useState<AssetCatalog>({});

  const drawSnapshot = useCallback(
    (scenario: ClimbScenario) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const nextSnapshot = scenario.world.snapshot();
      if (canvas && context && typeof context.clearRect === "function") {
        drawWorld(context, nextSnapshot, assets, scenario.clock.now());
      }
      return nextSnapshot;
    },
    [assets],
  );

  const advanceFrame = useCallback(() => {
    const scenario = scenarioRef.current;
    scenario.clock.advanceBy(16);
    scenario.world.step(16);
    setSnapshot(drawSnapshot(scenario));
    setFrameNumber((prev) => prev + 1);
  }, [drawSnapshot]);

  const resetScenario = useCallback(() => {
    const scenario = createClimbPlaygroundScenario();
    scenarioRef.current = scenario;
    setSnapshot(drawSnapshot(scenario));
    setFrameNumber(0);
  }, [drawSnapshot]);

  useEffect(() => {
    let isMounted = true;

    loadPlaygroundPetAssetCatalog()
      .then((catalog) => {
        if (isMounted) setAssets(catalog);
      })
      .catch(() => {
        if (isMounted) setAssets({});
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    drawSnapshot(scenarioRef.current);
  }, [drawSnapshot]);

  useEffect(() => {
    if (!isAnimationPlaying) return;
    const intervalId = window.setInterval(advanceFrame, 16);
    return () => window.clearInterval(intervalId);
  }, [advanceFrame, isAnimationPlaying]);

  return (
    <section className="climb-playground-shell">
      <header>
        <h1>Climb playground</h1>
      </header>
      <section className="scenario-controls">
        <Button size="sm" onClick={() => setIsAnimationPlaying((prev) => !prev)}>
          {isAnimationPlaying ? "Pause animation" : "Resume animation"}
        </Button>
        <Button size="sm" variant="neutral" onClick={advanceFrame}>
          Play next frame
        </Button>
        <Button size="sm" variant="ghost" onClick={resetScenario}>
          Reset climbs
        </Button>
        <p>Frame: {frameNumber}</p>
      </section>
      <div className="climb-playground-stage">
        <canvas
          ref={canvasRef}
          data-testid="climb-world-canvas"
          width={snapshot.width}
          height={snapshot.height}
          style={{ aspectRatio: `${snapshot.width} / ${snapshot.height}` }}
        />
        <PetStatusList pets={snapshot.pets} />
      </div>
    </section>
  );
}
