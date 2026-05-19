import { describe, expect, it } from "vitest";
import type { SimulationSystem } from "@/core/systems/simulation-system";
import { describeSimulationSystems, runSimulationSystems } from "@/core/systems/simulation-system";

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

  it("documents system dependencies without changing the explicit run order", () => {
    const systems: SimulationSystem<{ deltaMs: number }>[] = [
      {
        name: "MotionTargetSystem",
        reads: ["IntentState", "MotionTarget", "Transform", "UserAnchor"],
        writes: ["MotionTarget"],
        update() {},
      },
      {
        name: "IntentSteeringSystem",
        dependsOn: ["MotionTargetSystem"],
        reads: ["Transform", "MovementProfile", "IntentState", "MotionTarget"],
        writes: ["PhysicsForce"],
        update() {},
      },
    ];

    expect(describeSimulationSystems(systems)).toEqual([
      {
        name: "MotionTargetSystem",
        reads: ["IntentState", "MotionTarget", "Transform", "UserAnchor"],
        writes: ["MotionTarget"],
      },
      {
        name: "IntentSteeringSystem",
        dependsOn: ["MotionTargetSystem"],
        reads: ["Transform", "MovementProfile", "IntentState", "MotionTarget"],
        writes: ["PhysicsForce"],
      },
    ]);
  });
});
