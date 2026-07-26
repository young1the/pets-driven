import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";
import type { AgentActivitySignalComponent } from "@pets-driven/pet-engine/features/agent/components";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import { describe, expect, it } from "vitest";

/** Every activity a working pet may report. One per work-* decision kind. */
const WORKING_ACTIVITIES = ["headsDown", "mullingOver", "pacing"];

type ToolStream = {
  /** Gap between tool pulses, in milliseconds. */
  every: number;
  activities: Array<AgentActivitySignalComponent["activity"]>;
};

/**
 * End-to-end cover for the working state: a demo pet is driven through a real
 * task by the full tick pipeline rather than by calling a system directly.
 *
 * This suite exists because every bug the working state has had was invisible
 * to unit tests — the decision system did the right thing in isolation while
 * something downstream (an agent-event claim that never expired, an arrival
 * dwell, ambient idle chatter) ate the result before it reached the screen.
 * Assert on what the pet window would actually render.
 */
function runWorkingTask(seconds: number, tools?: ToolStream) {
  const { world, clock } = createDemoScenario();
  world.pushEvent({ kind: "agent", type: "task.started", sourceId: "agent-a", at: 0 });

  const rows = new Set<string>();
  const activities = new Set<string>();
  const tones = new Set<string>();
  const ticks = Math.round((seconds * 1_000) / 16);
  const pulseEvery = tools ? Math.max(1, Math.round(tools.every / 16)) : 0;

  for (let tick = 0; tick < ticks; tick += 1) {
    clock.advanceBy(16);
    // A live agent calls tools in a steady stream; each one is a pulse, not a
    // new task.
    if (tools && tick > 0 && tick % pulseEvery === 0) {
      const activity = tools.activities[(tick / pulseEvery) % tools.activities.length];
      world.pushEvent({
        kind: "agent",
        type: "tool.used",
        sourceId: "agent-a",
        at: clock.now(),
        ...(activity ? { activity } : {}),
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
   * The realistic case: a live agent fires a tool hook every ~1.5s for the whole
   * task. Reporting each one as task.started took a fresh 5s priority claim
   * every time, so the pet was pinned under it start to finish and not one
   * working pose ever reached the screen (measured: 1200 of 1200 ticks).
   */
  it("still plays its working poses under a stream of tool hooks", () => {
    const { activities } = runWorkingTask(20, {
      every: 1_500,
      activities: ["study", "edit", "run"],
    });

    expect([...activities].some((activity) => WORKING_ACTIVITIES.includes(activity))).toBe(true);
  });

  it("shows more than one working behavior as the agent switches kinds of work", () => {
    const { activities } = runWorkingTask(30, {
      every: 1_500,
      activities: ["study", "edit", "run", "study", "edit"],
    });

    const working = [...activities].filter((activity) => WORKING_ACTIVITIES.includes(activity));
    expect(working.length).toBeGreaterThan(1);
  });

  /**
   * An agent that reports no classifiable tool (an unrecognised MCP name, a
   * provider that names nothing) must still get a live pet — the pulse only
   * biases the choice, it is not what produces the behavior.
   */
  it("keeps working behaviors when no pulse carries an activity", () => {
    const { activities, rows } = runWorkingTask(20, { every: 1_500, activities: [null] });

    expect([...activities].some((activity) => WORKING_ACTIVITIES.includes(activity))).toBe(true);
    expect(rows.size).toBeGreaterThan(1);
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
