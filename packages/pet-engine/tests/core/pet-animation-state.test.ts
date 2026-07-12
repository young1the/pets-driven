import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";

function petBodyAnimationState(id: string) {
  const scenario = createDemoScenario();
  const bodySnapshot = () =>
    scenario.world.snapshot().bodies.find((body) => body.id === id);

  // Directional running is a function of the pet's per-tick displacement
  // (TravelState), which the engine derives from Transform — not from the
  // matter.js body velocity. Tests set it directly to drive the mapping.
  const setTravel = (dx: number, dy: number) =>
    scenario.world.setComponent(id, {
      type: "TravelState",
      previousPosition: { x: 0, y: 0 },
      dx,
      dy,
    });

  return {
    scenario,
    bodySnapshot,
    setTravel,
    animationState: () => bodySnapshot()?.animationState,
  };
}

describe("pet animation state", () => {
  it("uses idle when a pet has no active animation cue", () => {
    const { animationState } = petBodyAnimationState("pet-a");

    expect(animationState()).toBe("idle");
  });

  it("uses directional running states while moving horizontally", () => {
    const { setTravel, animationState } = petBodyAnimationState("pet-a");

    setTravel(4, 0);
    expect(animationState()).toBe("running-right");

    setTravel(-4, 0);
    expect(animationState()).toBe("running-left");
  });

  it("uses directional running even at slow walking speeds", () => {
    const { setTravel, animationState } = petBodyAnimationState("pet-a");

    // Real walking spends most of its time well below the old 0.5 threshold;
    // these speeds must still read as directional travel, not in-place running.
    setTravel(0.3, 0);
    expect(animationState()).toBe("running-right");

    setTravel(-0.3, 0);
    expect(animationState()).toBe("running-left");
  });

  it("does not infer left or right when the pet is not moving", () => {
    const { scenario, setTravel, animationState } =
      petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });
    setTravel(0, 0);
    scenario.world.setComponent("pet-a", {
      type: "Steering",
      mode: "pursue",
    });

    expect(animationState()).toBe("running");
  });

  it("uses waiting for blocked-on-user-input agent events", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.waiting",
      sourceId: "agent-a",
      at: 1,
      summary: "Needs approval",
    });
    scenario.world.step(0);

    expect(animationState()).toBe("waiting");
  });

  it("uses failed for failed agent events", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.failed",
      sourceId: "agent-a",
      at: 1,
      summary: "Tool failed",
    });
    scenario.world.step(0);

    expect(animationState()).toBe("failed");
  });

  it("uses review for completed agent events", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.pushEvent({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 1,
      summary: "Done",
    });
    scenario.world.step(0);

    expect(animationState()).toBe("review");
  });

  it("uses task-running and jumping rows for matching behavior state", () => {
    const { scenario, animationState } = petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "ContactState",
      grounded: true,
      climbableSurfaceId: null,
      climbableSurfacePosition: null,
    });
    scenario.world.setComponent("pet-a", {
      type: "Steering",
      mode: "pursue",
    });
    expect(animationState()).toBe("running");

    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });
    expect(animationState()).toBe("jumping");
  });

  it("keeps jumping while airborne with leftward momentum", () => {
    const { scenario, setTravel, animationState } =
      petBodyAnimationState("pet-a");

    setTravel(-4, 0);
    scenario.world.setComponent("pet-a", {
      type: "JumpActionState",
      phase: "requested",
      cooldownMs: 0,
    });

    expect(animationState()).toBe("jumping");
  });

  it("shows travel animation when a working pet is moving", () => {
    const { scenario, setTravel, animationState } =
      petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "AgentTaskState",
      status: "working",
      since: 0,
    });
    setTravel(4, 0);
    expect(animationState()).toBe("running-right");

    setTravel(-4, 0);
    expect(animationState()).toBe("running-left");
  });

  it("shows running animation when a working pet is not moving", () => {
    const { scenario, setTravel, animationState } =
      petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "AgentTaskState",
      status: "working",
      since: 0,
    });
    setTravel(0, 0);
    expect(animationState()).toBe("running");
  });

  it.each([
    ["greet", "waving"],
    ["groom", "running"],
    ["observe", "review"],
    ["beckon", "waiting"],
    ["fret", "failed"],
    ["nap", "idle"],
    ["meditate", "review"],
    ["keep-watch", "waiting"],
    ["peek", "review"],
    ["inspect", "review"],
    ["follow-routine", "running"],
    ["offer-comfort", "waving"],
    ["stand-lookout", "failed"],
  ] as const)(
    "shows the %s expressive pose on its sprite row",
    (reason, expected) => {
      const { scenario, setTravel, animationState } =
        petBodyAnimationState("pet-a");

      // A held expressive pose: standing still with the sustained autonomous
      // claim naming the gesture.
      setTravel(0, 0);
      scenario.world.setComponent("pet-a", { type: "Steering", mode: "stand" });
      scenario.world.setComponent("pet-a", {
        type: "BehaviorDecisionState",
        source: "autonomous",
        decidedAt: 0,
        expiresAt: 5_000,
        reason,
        lastAutonomousReason: reason,
        lastAutonomousAt: 0,
      });

      expect(animationState()).toBe(expected);
    },
  );

  it("keeps travel over an expressive pose while the pet is moving", () => {
    const { scenario, setTravel, animationState } =
      petBodyAnimationState("pet-a");

    scenario.world.setComponent("pet-a", {
      type: "BehaviorDecisionState",
      source: "autonomous",
      decidedAt: 0,
      expiresAt: 5_000,
      reason: "greet",
      lastAutonomousReason: "greet",
      lastAutonomousAt: 0,
    });
    setTravel(4, 0);

    expect(animationState()).toBe("running-right");
  });

  it("derives travel displacement from Transform, not physics velocity", () => {
    const { scenario } = petBodyAnimationState("pet-a");

    // Seed the previous position, then teleport the body purely by position
    // (velocity stays ~0). If travel were read from matter.js velocity this
    // would register as standing still; from Transform it is a clear rightward
    // step, proving the animation input is decoupled from physics velocity.
    scenario.world.step(16);
    const start = scenario.world.getComponent("pet-a", "Transform")!.position;
    scenario.world.setPhysicsPosition("pet-a", { x: start.x + 100 });
    scenario.world.step(16);

    const travel = scenario.world.getComponent("pet-a", "TravelState")!;
    expect(travel.dx).toBeGreaterThan(50);
  });
});
