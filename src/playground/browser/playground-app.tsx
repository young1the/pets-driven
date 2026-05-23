import {
  createAgentEvent,
  type AgentEvent,
} from "@/adapters/agent-events/agent-event";
import { toStimulus } from "@/adapters/agent-events/agent-event-adapter";
import { useCallback, useEffect, useRef, useState } from "react";
import { createDemoScenario } from "@/core/scenario-fixtures";
import { ActionTimeline, type TimelineEntry } from "./action-timeline";
import { AgentEventPanel } from "./agent-event-panel";
import { BehaviorLab } from "./behavior-lab";
import { drawWorld } from "./canvas-renderer";
import { PetStatusList } from "./pet-status-list";
import {
  PLAYGROUND_SAMPLE_EVENT_SUMMARIES,
  PLAYGROUND_TEXT,
} from "./playground-text";
import { ScenarioControls } from "./scenario-controls";

type Snapshot = ReturnType<
  ReturnType<typeof createDemoScenario>["world"]["snapshot"]
>;

function diffSnapshot(
  prev: Snapshot,
  next: Snapshot,
  t: number,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const pet of next.pets) {
    const prevPet = prev.pets.find((p) => p.id === pet.id);
    if (!prevPet) continue;
    if (prevPet.locomotion !== pet.locomotion) {
      entries.push({
        t,
        petName: pet.name,
        label: `locomotion: ${prevPet.locomotion} -> ${pet.locomotion}`,
      });
    }
    if (prevPet.intent !== pet.intent) {
      entries.push({
        t,
        petName: pet.name,
        label: `intent: ${prevPet.intent} -> ${pet.intent}`,
      });
    }
  }
  return entries;
}

export function PlaygroundApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(createDemoScenario());
  const [lastStimulus, setLastStimulus] = useState("none");
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
  const [selectedPetId, setSelectedPetId] = useState("pet-a");
  const [snapshot, setSnapshot] = useState(() =>
    scenarioRef.current.world.snapshot(),
  );
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [frameNumber, setFrameNumber] = useState(0);
  const prevSnapshotRef = useRef<Snapshot | null>(null);

  const advanceFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    scenarioRef.current.clock.advanceBy(16);
    scenarioRef.current.world.step(16);
    const nextSnapshot = scenarioRef.current.world.snapshot();
    setSnapshot(nextSnapshot);
    setFrameNumber((prev) => prev + 1);
    const t = scenarioRef.current.clock.now();
    if (prevSnapshotRef.current) {
      const newEntries = diffSnapshot(prevSnapshotRef.current, nextSnapshot, t);
      if (newEntries.length > 0) {
        setTimelineEntries((prev) => [...newEntries, ...prev].slice(0, 40));
      }
    }
    prevSnapshotRef.current = nextSnapshot;
    drawWorld(context, nextSnapshot, {}, scenarioRef.current.clock.now());
  }, []);

  useEffect(() => {
    if (!isAnimationPlaying) {
      return;
    }

    const intervalId = window.setInterval(advanceFrame, 16);
    return () => window.clearInterval(intervalId);
  }, [advanceFrame, isAnimationPlaying]);

  function sendEvent(type: AgentEvent["type"], summary: string) {
    const event = createAgentEvent({
      type,
      sourceId: "agent-a",
      at: scenarioRef.current.clock.now(),
      summary,
    });

    scenarioRef.current.world.pushStimulus(toStimulus(event));
    scenarioRef.current.world.step(0);
    const nextSnapshot = scenarioRef.current.world.snapshot();
    setSnapshot(nextSnapshot);
    setLastStimulus(type);
    setLastEvent(event);

    const t = scenarioRef.current.clock.now();
    if (prevSnapshotRef.current) {
      const newEntries = diffSnapshot(prevSnapshotRef.current, nextSnapshot, t);
      if (newEntries.length > 0) {
        setTimelineEntries((prev) => [...newEntries, ...prev].slice(0, 40));
      }
    }
    prevSnapshotRef.current = nextSnapshot;
  }

  function startWalkDemo() {
    const alice = snapshot.pets.find((pet) => pet.id === "pet-a");
    switchAliceToWalk();
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
    switchAliceToWalk();
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
    switchAliceToWalk();
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

  function switchAliceToWalk() {
    scenarioRef.current.world.removeComponent("pet-a", "ClimbingState");
    scenarioRef.current.world.removeComponent("pet-a", "FlyingState");
    scenarioRef.current.world.setComponent("pet-a", { type: "WalkingState" });
  }

  return (
    <main className="playground-shell">
      <header>
        <h1>{PLAYGROUND_TEXT.title}</h1>
      </header>
      <ScenarioControls
        lastStimulus={lastStimulus}
        onSendStarted={() =>
          sendEvent("task.started", PLAYGROUND_SAMPLE_EVENT_SUMMARIES.started)
        }
        onSendWaiting={() =>
          sendEvent("task.waiting", PLAYGROUND_SAMPLE_EVENT_SUMMARIES.waiting)
        }
        onSendCompleted={() =>
          sendEvent(
            "task.completed",
            PLAYGROUND_SAMPLE_EVENT_SUMMARIES.completed,
          )
        }
        onStartWalkDemo={startWalkDemo}
        onStartJumpDemo={startJumpDemo}
        onStartWallClimbDemo={startWallClimbDemo}
        isAnimationPlaying={isAnimationPlaying}
        frameNumber={frameNumber}
        onToggleAnimation={() => setIsAnimationPlaying((prev) => !prev)}
        onPlayNextFrame={advanceFrame}
      />
      <AgentEventPanel event={lastEvent} />
      <div className="playground-workspace">
        <div className="playground-stage">
          <canvas
            ref={canvasRef}
            data-testid="world-canvas"
            width={960}
            height={540}
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
      <ActionTimeline entries={timelineEntries} />
    </main>
  );
}
