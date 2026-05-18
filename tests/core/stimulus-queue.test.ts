import { describe, expect, it } from "vitest";
import { createStimulusQueue } from "../../src/core/stimuli/stimulus-queue";

describe("stimulus queue", () => {
  it("drains stimuli in insertion order", () => {
    const queue = createStimulusQueue();
    queue.push({ type: "task.started", sourceId: "a", at: 1 });
    queue.push({ type: "task.waiting", sourceId: "a", at: 2, summary: "Needs approval" });

    expect(queue.drain()).toEqual([
      { type: "task.started", sourceId: "a", at: 1 },
      { type: "task.waiting", sourceId: "a", at: 2, summary: "Needs approval" },
    ]);
    expect(queue.drain()).toEqual([]);
  });
});
