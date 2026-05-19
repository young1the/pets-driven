import { describe, expect, it } from "vitest";
import type { SimulationSystem } from "@/core/systems/simulation-system";
import { runSimulationSystems } from "@/core/systems/simulation-system";

describe("simulation system runner", () => {
  it("runs systems with one shared context in declaration order", () => {
    const calls: string[] = [];
    const context = { deltaMs: 16 };
    const systems: SimulationSystem<typeof context>[] = [
      {
        name: "FirstSystem",
        update(systemContext) {
          calls.push(`${this.name}:${systemContext.deltaMs}`);
        },
      },
      {
        name: "SecondSystem",
        update(systemContext) {
          calls.push(`${this.name}:${systemContext.deltaMs}`);
        },
      },
    ];

    runSimulationSystems(systems, context);

    expect(calls).toEqual(["FirstSystem:16", "SecondSystem:16"]);
  });
});
