import { Button } from "@pets-driven/design-system";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createJumpPlaygroundScenario,
  JUMP_PLAYGROUND_PET_IDS,
  nextJumpPlaygroundTarget,
} from "@/core/scenario-fixtures";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import { loadPlaygroundPetAssetCatalog } from "@/pets/assets/codex-pet-fixtures";
import type { AssetCatalog } from "@/pets/rendering/pet-sprite-canvas";

type JumpScenario = ReturnType<typeof createJumpPlaygroundScenario>;
type JumpWorld = JumpScenario["world"];
type JumpPetId = (typeof JUMP_PLAYGROUND_PET_IDS)[number];
type JumpSchedule = Record<JumpPetId, number>;

export function JumpPlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createJumpPlaygroundScenario({ startJumping: false }));
  const jumpScheduleRef = useRef(createJumpSchedule());
  const [snapshot, setSnapshot] = useState(() => scenarioRef.current.world.snapshot());
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [frameNumber, setFrameNumber] = useState(0);
  const [assets, setAssets] = useState<AssetCatalog>({});

  const drawSnapshot = useCallback((scenario: JumpScenario) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || typeof context.clearRect !== "function") {
      return scenario.world.snapshot();
    }

    const nextSnapshot = scenario.world.snapshot();
    drawWorld(context, nextSnapshot, assets, scenario.clock.now());
    return nextSnapshot;
  }, [assets]);

  const advanceFrame = useCallback(() => {
    const scenario = scenarioRef.current;
    requestReadyJumps(scenario.world, scenario.clock.now(), jumpScheduleRef.current);
    scenario.clock.advanceBy(16);
    scenario.world.step(16);
    setSnapshot(drawSnapshot(scenario));
    setFrameNumber((prev) => prev + 1);
  }, [drawSnapshot]);

  const resetScenario = useCallback(() => {
    const scenario = createJumpPlaygroundScenario({ startJumping: false });
    scenarioRef.current = scenario;
    jumpScheduleRef.current = createJumpSchedule();
    setSnapshot(drawSnapshot(scenario));
    setFrameNumber(0);
  }, [drawSnapshot]);

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
    drawSnapshot(scenarioRef.current);
  }, [drawSnapshot]);

  useEffect(() => {
    if (!isAnimationPlaying) {
      return;
    }

    const intervalId = window.setInterval(advanceFrame, 16);
    return () => window.clearInterval(intervalId);
  }, [advanceFrame, isAnimationPlaying]);

  return (
    <main className="playground-shell jump-playground-shell">
      <header>
        <h1>Jump playground</h1>
      </header>
      <section className="scenario-controls">
        <Button size="sm" onClick={() => setIsAnimationPlaying((prev) => !prev)}>
          {isAnimationPlaying ? "Pause animation" : "Resume animation"}
        </Button>
        <Button size="sm" variant="neutral" onClick={advanceFrame}>Play next frame</Button>
        <Button size="sm" variant="ghost" onClick={resetScenario}>Reset jumps</Button>
        <p>Frame: {frameNumber}</p>
      </section>
      <div className="jump-playground-stage">
        <canvas
          ref={canvasRef}
          data-testid="jump-world-canvas"
          width={snapshot.width}
          height={snapshot.height}
          style={{ aspectRatio: `${snapshot.width} / ${snapshot.height}` }}
        />
        <PetStatusList pets={snapshot.pets} />
      </div>
    </main>
  );
}

function createJumpSchedule(): JumpSchedule {
  return JUMP_PLAYGROUND_PET_IDS.reduce((schedule, id, index) => {
    schedule[id] = index * 320;
    return schedule;
  }, {} as JumpSchedule);
}

function requestReadyJumps(world: JumpWorld, now: number, schedule: JumpSchedule) {
  for (const id of JUMP_PLAYGROUND_PET_IDS) {
    if (now < schedule[id]) continue;

    const contact = world.getComponent(id, "ContactState");
    if (!contact?.grounded) continue;
    if (world.getComponent(id, "JumpActionState")) continue;

    const transform = world.getComponent(id, "Transform");
    if (!transform) continue;

    world.setComponent(id, {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: nextJumpPlaygroundTarget(id, transform.position.x, transform.position.y),
    });
    world.setComponent(id, {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
    world.setComponent(id, {
      type: "ActivityState",
      lastActiveAt: now,
    });
    schedule[id] = now + 2_400;
  }
}
