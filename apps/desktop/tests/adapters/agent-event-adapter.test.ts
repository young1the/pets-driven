import { describe, expect, it } from "vitest";
import { createAgentEvent } from "@/adapters/agent-events/agent-event";
import { toWorldEvent } from "@/adapters/agent-events/agent-event-adapter";
import { createAgentEventFromHook } from "@/adapters/agent-events/agent-hook-adapter";
import { createAgentEventFromClaudeHook } from "@/adapters/agent-events/claude-hook-adapter";
import { createAgentEventFromCodexHook } from "@/adapters/agent-events/codex-hook-adapter";
import { classifyToolActivity } from "@/adapters/agent-events/tool-activity";

describe("agent event adapters", () => {
  it.each([
    "task.started",
    "task.waiting",
    "task.completed",
    "task.failed",
  ] as const)("maps %s into the matching engine event", (type) => {
    expect(
      toWorldEvent(
        createAgentEvent({
          type,
          sourceId: "agent-a",
          at: 10,
          summary: "Lifecycle update",
        }),
      ),
    ).toEqual({
      kind: "agent",
      type,
      sourceId: "agent-a",
      at: 10,
      summary: "Lifecycle update",
    });
  });

  it("maps tool pulses without a user-facing summary", () => {
    expect(
      toWorldEvent(
        createAgentEvent({
          type: "tool.used",
          sourceId: "agent-a",
          at: 10,
          activity: "run",
        }),
      ),
    ).toEqual({
      kind: "agent",
      type: "tool.used",
      sourceId: "agent-a",
      at: 10,
      activity: "run",
    });
  });

  it.each([
    ["UserPromptSubmit", "task.started", "New prompt received"],
    ["PermissionRequest", "task.waiting", "Permission required"],
    ["Notification", "task.waiting", "Needs attention"],
    ["StopFailure", "task.failed", "Task failed"],
    ["Stop", "task.completed", "Task completed"],
  ] as const)("maps Claude %s through its adapter", (hookEventName, type, summary) => {
    expect(
      createAgentEventFromClaudeHook(
        { hook_event_name: hookEventName },
        { defaultSourceId: "agent-a", now: 10 },
      ),
    ).toEqual({ type, sourceId: "agent-a", at: 10, summary });
  });

  it("keeps Claude and Codex payload contracts behind separate adapters", () => {
    expect(
      createAgentEventFromClaudeHook(
        { hook_event_name: "PreToolUse", tool_name: "Read" },
        { defaultSourceId: "claude", now: 10 },
      ),
    ).toEqual({
      type: "tool.used",
      sourceId: "claude",
      at: 10,
      activity: "study",
    });
    expect(
      createAgentEventFromCodexHook(
        { hook_event_name: "PreToolUse" },
        { defaultSourceId: "codex", now: 10 },
      ),
    ).toEqual({
      type: "tool.used",
      sourceId: "codex",
      at: 10,
      activity: undefined,
    });
  });

  it("dispatches a provider envelope through the matching adapter", () => {
    expect(
      createAgentEventFromHook(
        {
          provider: "codex",
          payload: { hook_event_name: "PermissionRequest", thread_id: "thread-1" },
        },
        { now: 10 },
      ),
    ).toEqual({
      type: "task.waiting",
      sourceId: "thread-1",
      at: 10,
      summary: "Permission required",
    });
  });

  it.each([
    ["create_thread", "edit"],
    ["update_widget", "edit"],
    ["delete_target", "edit"],
    ["Read", "study"],
    ["Bash", "run"],
  ] as const)("classifies %s as %s without substring precedence bugs", (tool, activity) => {
    expect(classifyToolActivity(tool)).toBe(activity);
  });

  /**
   * Case is the only separator a built-in name has. Lowercasing before
   * splitting collapses `WebSearch` into one token that matches nothing, which
   * silently left most of a Claude session unclassified.
   */
  it.each([
    ["Grep", "study"],
    ["Glob", "study"],
    ["WebSearch", "study"],
    ["WebFetch", "study"],
    ["NotebookRead", "study"],
    ["Task", "study"],
    ["ExitPlanMode", "study"],
    ["TodoWrite", "study"],
    ["Edit", "edit"],
    ["MultiEdit", "edit"],
    ["Write", "edit"],
    ["NotebookEdit", "edit"],
    ["BashOutput", "run"],
    ["KillShell", "run"],
  ] as const)("classifies the built-in tool %s as %s", (tool, activity) => {
    expect(classifyToolActivity(tool)).toBe(activity);
  });

  /** The server segment must not be scanned: `mcp__test__…` is not a shell run. */
  it.each([
    ["mcp__test__read_file", "study"],
    ["mcp__build__list_items", "study"],
    ["mcp__linear__get_issue", "study"],
    ["mcp__linear__create_issue", "edit"],
    ["mcp__github__update_pull_request", "edit"],
    ["mcp__ci__run_pipeline", "run"],
  ] as const)("classifies the MCP tool %s as %s", (tool, activity) => {
    expect(classifyToolActivity(tool)).toBe(activity);
  });

  it.each([
    undefined,
    "",
    "   ",
    "Frobnicate",
    "mcp__thing__quux",
  ])("leaves %p unclassified rather than guessing", (tool) => {
    expect(classifyToolActivity(tool)).toBeUndefined();
  });

  it("rejects unsupported provider hooks independently", () => {
    expect(() => createAgentEventFromClaudeHook({ hook_event_name: "SessionStart" })).toThrow(
      "Unsupported Claude hook event: SessionStart",
    );
    expect(() => createAgentEventFromCodexHook({ hook_event_name: "TaskCompleted" })).toThrow(
      "Unsupported Codex hook event: TaskCompleted",
    );
  });
});
