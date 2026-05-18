import { createManualClock } from "@/shared/time/manual-clock";
import { createWorld } from "./create-world";

export function createDemoScenario() {
  const clock = createManualClock(0);
  const world = createWorld({
    width: 960,
    height: 540,
    clock,
    pets: [
      {
        id: "pet-a",
        sourceId: "agent-a",
        components: { Talkative: { type: "Talkative", idleAfterMs: 5_000 } },
        runtime: { lastActiveAt: 0, speech: null, intent: "idle" },
      },
      {
        id: "pet-b",
        sourceId: "agent-b",
        components: {},
        runtime: { lastActiveAt: 0, speech: null, intent: "idle" },
      },
      {
        id: "pet-c",
        sourceId: "agent-c",
        components: {},
        runtime: { lastActiveAt: 0, speech: null, intent: "idle" },
      },
    ],
  });

  return { clock, world };
}
