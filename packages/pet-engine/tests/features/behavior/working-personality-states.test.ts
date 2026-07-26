import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import { describe, expect, it } from "vitest";

const WORKING_ACTIVITIES = [
  "headsDown",
  "tinkering",
  "mullingOver",
  "fussingOver",
  "dawdling",
  "pacing",
];

/**
 * End-to-end cover for the working state: a demo pet is driven through a real
 * task by the full tick pipeline rather than by calling the working system
 * directly. Before the working styles this ran for an entire task without the
 * sprite row or the status label ever changing — the pet simply stood there.
 */
function runWorkingTask(seconds: number, tools?: { every: number; names: string[] }) {
  const { world, clock } = createDemoScenario();
  world.pushEvent({ kind: "agent", type: "task.started", sourceId: "agent-a", at: 0 });

  const rows = new Set<string>();
  const activities = new Set<string>();
  const tones = new Set<string>();
  const ticks = Math.round((seconds * 1_000) / 16);

  for (let tick = 0; tick < ticks; tick += 1) {
    clock.advanceBy(16);
    // A live agent calls tools in a steady stream; each one is a pulse, not a
    // new task.
    if (tools && tick > 0 && tick % Math.round(tools.every / 16) === 0) {
      world.pushEvent({
        kind: "agent",
        type: "tool.used",
        sourceId: "agent-a",
        at: clock.now(),
        tool: tools.names[(tick / Math.round(tools.every / 16)) % tools.names.length],
      });
    }
    world.step(16);
    const snapshot = world.snapshot();
    const pet = snapshot.pets.find((entry) => entry.sourceId === "agent-a");
    if (pet?.agentTask?.status !== "working") continue;

    const body = snapshot.bodies.find((entry) => entry.id === pet.id);
    if (body?.animationState) rows.add(body.animationState);
    if (pet.activity) activities.add(pet.activity);
    // The capsule the desktop pet window renders for this tick.
    const channel = pet.agentChannel;
    tones.add(
      presentPetStatus(
        body?.animationState,
        channel
          ? {
              kind: "agent-channel",
              status: channel.status,
              label: channel.label,
              message: channel.message,
            }
          : null,
        pet.activity,
        pet.social?.partnerName ?? null,
        true,
      ).tone,
    );
  }

  return { rows, activities, tones };
}

describe("a working pet stays alive on screen", () => {
  it("cycles through several sprite rows over one task", () => {
    const { rows } = runWorkingTask(20);

    // The work row still dominates, but it is no longer the only thing shown.
    expect(rows).toContain("running");
    expect(rows.size).toBeGreaterThan(1);
  });

  it("reports a working activity instead of a mute working capsule", () => {
    const { activities } = runWorkingTask(20);

    expect([...activities].some((activity) => WORKING_ACTIVITIES.includes(activity))).toBe(true);
  });

  /**
   * The realistic case: a live agent fires a tool hook every ~1.5s for the
   * whole task. Reporting each one as task.started took a fresh 5s priority
   * claim every time, so the pet was pinned under it start to finish and not
   * one working pose ever reached the screen (measured: 1200 of 1200 ticks).
   */
  it("still plays its working poses under a stream of tool hooks", () => {
    const { activities } = runWorkingTask(20, {
      every: 1_500,
      names: ["Read", "Edit", "Bash"],
    });

    expect([...activities].some((activity) => WORKING_ACTIVITIES.includes(activity))).toBe(true);
  });

  it("acts out more than one kind of work as the agent switches tools", () => {
    const { activities } = runWorkingTask(30, {
      every: 1_500,
      names: ["Read", "Grep", "Edit", "Write", "Bash"],
    });

    const workingActivities = [...activities].filter((activity) =>
      WORKING_ACTIVITIES.includes(activity),
    );
    expect(workingActivities.length).toBeGreaterThan(1);
  });

  /**
   * Ambient idle chatter used to claim over the working pose for its whole
   * bubble, so a busy pet spent stretches of every task labelled "Chatting" in
   * the neutral ambient tone — it looked like the task had been released.
   */
  it("never drops the work tone or reads as ambient chatter mid-task", () => {
    const { activities, tones } = runWorkingTask(20);

    expect(activities).not.toContain("chatting");
    expect([...tones]).toEqual(["work"]);
  });
});
