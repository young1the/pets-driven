import { describe, expect, it } from "vitest";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";
import { createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";

describe("agent event adapter", () => {
  it.each(["task.started", "task.waiting", "task.completed", "task.failed"] as const)(
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

  it.each([
    ["UserPromptSubmit", "task.started", "New prompt received"],
    ["PreToolUse", "task.started", "Bash tool activity"],
    ["PostToolUse", "task.started", "Bash tool activity"],
    ["PostToolBatch", "task.started", "Working"],
    ["PermissionRequest", "task.waiting", "Permission required"],
    ["Notification", "task.waiting", "Needs attention"],
    ["PostToolUseFailure", "task.failed", "Task failed"],
    ["StopFailure", "task.failed", "Task failed"],
    ["Stop", "task.completed", "Task completed"],
    ["TaskCompleted", "task.completed", "Task completed"],
  ] as const)(
    "maps Claude %s hooks into %s agent events",
    (hookEventName, type, summary) => {
      expect(
        createAgentEventFromClaudeHook(
          {
            hook_event_name: hookEventName,
            tool_name: hookEventName.includes("Tool") ? "Bash" : undefined,
          },
          { defaultSourceId: "agent-a", now: 10 },
        ),
      ).toEqual({
        type,
        sourceId: "agent-a",
        at: 10,
        summary,
      });
    },
  );

  it("prefers explicit Claude hook source and summary fields", () => {
    expect(
      createAgentEventFromClaudeHook(
        {
          hook_event_name: "Notification",
          sourceId: "agent-b",
          summary: "Review this",
          timestamp: 42,
        },
        { defaultSourceId: "agent-a", now: 10 },
      ),
    ).toEqual({
      type: "task.waiting",
      sourceId: "agent-b",
      at: 42,
      summary: "Review this",
    });
  });

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

  it("rejects unsupported Claude hook events", () => {
    expect(() =>
      createAgentEventFromClaudeHook({ hook_event_name: "SessionStart" }),
    ).toThrow("Unsupported Claude hook event: SessionStart");
  });
});
