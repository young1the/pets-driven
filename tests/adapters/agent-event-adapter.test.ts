import { describe, expect, it } from "vitest";
import { createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";

describe("agent event adapter", () => {
  it.each(["task.started", "task.waiting", "task.completed"] as const)(
    "maps %s into the matching agent world event",
    (type) => {
      const event = createAgentEvent({
        type,
        sourceId: "agent-a",
        at: 10,
        summary: "Lifecycle update",
      });

      expect(toWorldEvent(event)).toEqual({
        kind: "agent",
        type,
        sourceId: "agent-a",
        at: 10,
        summary: "Lifecycle update",
      });
    },
  );

  it("rejects unsupported task event types", () => {
    expect(() =>
      createAgentEvent({
        type: "task.paused",
        sourceId: "agent-a",
        at: 10,
      }),
    ).toThrow("Unsupported agent event type: task.paused");
  });

  it("rejects missing source identifiers", () => {
    expect(() =>
      createAgentEvent({
        type: "task.started",
        sourceId: "",
        at: 10,
      }),
    ).toThrow("Agent event sourceId must be a non-empty string.");
  });

  it("rejects invalid event timestamps", () => {
    expect(() =>
      createAgentEvent({
        type: "task.started",
        sourceId: "agent-a",
        at: Number.NaN,
      }),
    ).toThrow("Agent event at must be a finite number.");
  });
});
