import { describe, expect, it } from "vitest";
import { createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";

describe("agent event adapter", () => {
  it.each([
    "task.started",
    "task.waiting",
    "task.completed",
    "task.failed",
  ] as const)("maps %s into the matching agent world event", (type) => {
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
  });

  it("carries the reported tool on a tool pulse world event", () => {
    const event = createAgentEvent({
      type: "tool.used",
      sourceId: "agent-a",
      at: 10,
      summary: "Bash tool activity",
      tool: "Bash",
    });

    expect(toWorldEvent(event)).toEqual({
      kind: "agent",
      type: "tool.used",
      sourceId: "agent-a",
      at: 10,
      summary: "Bash tool activity",
      tool: "Bash",
    });
  });

  it.each([
    ["UserPromptSubmit", "task.started", "New prompt received"],
    // Tool hooks are the heartbeat of a running task, not a new task each time.
    ["PreToolUse", "tool.used", "Bash tool activity"],
    ["PostToolUse", "tool.used", "Bash tool activity"],
    ["PostToolBatch", "tool.used", "Working"],
    ["PermissionRequest", "task.waiting", "Permission required"],
    ["Notification", "task.waiting", "Needs attention"],
    ["PostToolUseFailure", "task.failed", "Task failed"],
    ["StopFailure", "task.failed", "Task failed"],
    ["Stop", "task.completed", "Task completed"],
    ["TaskCompleted", "task.completed", "Task completed"],
  ] as const)("maps Claude %s hooks into %s agent events", (hookEventName, type, summary) => {
    const toolName = hookEventName.includes("Tool") ? "Bash" : undefined;

    expect(
      createAgentEventFromClaudeHook(
        {
          hook_event_name: hookEventName,
          tool_name: toolName,
        },
        { defaultSourceId: "agent-a", now: 10 },
      ),
    ).toEqual({
      type,
      sourceId: "agent-a",
      at: 10,
      summary,
      // Only a pulse carries the tool; a failure hook named "…ToolUseFailure"
      // is a lifecycle event and drops it.
      tool: type === "tool.used" ? toolName : undefined,
    });
  });

  it("leaves the tool absent for an agent that reports none (Codex)", () => {
    const event = createAgentEventFromClaudeHook(
      { hook_event_name: "PreToolUse", summary: "Codex tool started" },
      { defaultSourceId: "codex", now: 10 },
    );

    expect(event.type).toBe("tool.used");
    expect(event.tool).toBeUndefined();
  });

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
    expect(() => createAgentEventFromClaudeHook({ hook_event_name: "SessionStart" })).toThrow(
      "Unsupported Claude hook event: SessionStart",
    );
  });
});
