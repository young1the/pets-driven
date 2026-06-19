import { describe, expect, it } from "vitest";
import { createWorldEventQueue } from "@pets-driven/pet-engine/features/events/world-event-queue";

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

  it("drains only events matching a predicate and preserves the rest", () => {
    const queue = createWorldEventQueue();
    const agent = { kind: "agent" as const, type: "task.started" as const, sourceId: "a", at: 1 };
    const pointer = { kind: "pointer" as const, type: "pointer.down" as const, pointerId: 1, at: 2, position: { x: 10, y: 20 } };
    const keyboard = { kind: "keyboard" as const, type: "keyboard.down" as const, key: "ArrowRight", code: "ArrowRight", at: 3 };

    queue.push(agent);
    queue.push(pointer);
    queue.push(keyboard);

    expect(queue.drainWhere((event) => event.kind === "pointer")).toEqual([pointer]);
    expect(queue.drain()).toEqual([agent, keyboard]);
  });

  it("keeps original order among preserved and drained events", () => {
    const queue = createWorldEventQueue();
    const p1 = { kind: "pointer" as const, type: "pointer.down" as const, pointerId: 1, at: 1, position: { x: 1, y: 1 } };
    const a1 = { kind: "agent" as const, type: "task.started" as const, sourceId: "a", at: 2 };
    const p2 = { kind: "pointer" as const, type: "pointer.up" as const, pointerId: 1, at: 3, position: { x: 2, y: 2 } };
    const a2 = { kind: "agent" as const, type: "task.completed" as const, sourceId: "a", at: 4 };

    queue.push(p1);
    queue.push(a1);
    queue.push(p2);
    queue.push(a2);

    expect(queue.drainWhere((event) => event.kind === "agent")).toEqual([a1, a2]);
    expect(queue.drain()).toEqual([p1, p2]);
  });
});
