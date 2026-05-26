import { describe, expect, it } from "vitest";
import { createWorldEventQueue } from "@/features/events/world-event-queue";

describe("world event queue", () => {
  it("drains agent, pointer, and keyboard events in insertion order", () => {
    const queue = createWorldEventQueue();
    queue.push({ kind: "agent", type: "task.started", sourceId: "a", at: 1 });
    queue.push({ kind: "pointer", type: "pointer.down", pointerId: 1, at: 2, position: { x: 10, y: 20 } });
    queue.push({ kind: "keyboard", type: "keyboard.down", key: "Enter", code: "Enter", at: 3, repeat: false });

    expect(queue.drain()).toEqual([
      { kind: "agent", type: "task.started", sourceId: "a", at: 1 },
      { kind: "pointer", type: "pointer.down", pointerId: 1, at: 2, position: { x: 10, y: 20 } },
      { kind: "keyboard", type: "keyboard.down", key: "Enter", code: "Enter", at: 3, repeat: false },
    ]);
    expect(queue.drain()).toEqual([]);
  });
});
