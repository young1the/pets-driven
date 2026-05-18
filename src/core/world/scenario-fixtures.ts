import { createManualClock } from "@/shared/time/manual-clock";
import { createWorld } from "./create-world";

export function createDemoScenario(options?: {
  userAnchor?: { x: number; y: number };
}) {
  const clock = createManualClock(0);
  const world = createWorld({
    width: 960,
    height: 540,
    clock,
    entities: [
      {
        id: "user-anchor",
        kind: "user-anchor",
        position: options?.userAnchor ?? { x: 480, y: 500 },
      },
    ],
    pets: [
      {
        id: "pet-a",
        sourceId: "agent-a",
        name: "Alice",
        movement: { idleSpeed: 0.0006, activeSpeed: 0.0012, seekUserSpeed: 0.0018 },
        components: { Talkative: { type: "Talkative", idleAfterMs: 5_000 } },
        runtime: {
          lastActiveAt: 0,
          speech: null,
          intent: "idle",
          motion: { targetEntityId: null, targetPosition: null },
        },
      },
      {
        id: "pet-b",
        sourceId: "agent-b",
        name: "Bob",
        movement: { idleSpeed: 0.0006, activeSpeed: 0.0012, seekUserSpeed: 0.0018 },
        components: {},
        runtime: {
          lastActiveAt: 0,
          speech: null,
          intent: "idle",
          motion: { targetEntityId: null, targetPosition: null },
        },
      },
      {
        id: "pet-c",
        sourceId: "agent-c",
        name: "Charlie",
        movement: { idleSpeed: 0.0006, activeSpeed: 0.0012, seekUserSpeed: 0.0018 },
        components: {},
        runtime: {
          lastActiveAt: 0,
          speech: null,
          intent: "idle",
          motion: { targetEntityId: null, targetPosition: null },
        },
      },
    ],
  });

  return { clock, world };
}
