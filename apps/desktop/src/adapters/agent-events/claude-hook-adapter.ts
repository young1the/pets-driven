import { type AgentEvent, createAgentEvent } from "./agent-event";
import type { AgentHookAdapter } from "./agent-hook-adapter";
import { classifyToolActivity } from "./tool-activity";

export type ClaudeHookAdapterOptions = {
  defaultSourceId?: string;
  now?: number;
};

export type ClaudeHookEventName =
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolBatch"
  | "PermissionRequest"
  | "Notification"
  | "PostToolUseFailure"
  | "StopFailure"
  | "Stop"
  | "TaskCompleted";

export type ClaudeHookPayload = {
  hook_event_name: ClaudeHookEventName;
  sourceId?: string;
  source_id?: string;
  agent_id?: string;
  session_id?: string;
  timestamp?: number;
  prompt?: string;
  message?: string;
  summary?: string;
  tool_name?: string;
};

const CLAUDE_HOOK_EVENT_NAMES = new Set<ClaudeHookEventName>([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolBatch",
  "PermissionRequest",
  "Notification",
  "PostToolUseFailure",
  "StopFailure",
  "Stop",
  "TaskCompleted",
]);

export function createAgentEventFromClaudeHook(
  payload: unknown,
  options: ClaudeHookAdapterOptions = {},
): AgentEvent {
  const hook = parseClaudeHookPayload(payload);
  const sourceId = firstNonEmpty(
    hook.sourceId,
    hook.source_id,
    hook.agent_id,
    hook.session_id,
    options.defaultSourceId,
    "agent-a",
  );

  const type = toAgentEventType(hook.hook_event_name);

  return createAgentEvent({
    type,
    sourceId,
    at: Number.isFinite(hook.timestamp) ? (hook.timestamp as number) : (options.now ?? Date.now()),
    summary: type === "tool.used" ? undefined : summaryForHook(hook),
    activity: type === "tool.used" ? classifyToolActivity(hook.tool_name) : undefined,
  });
}

export const CLAUDE_HOOK_ADAPTER: AgentHookAdapter = {
  provider: "claude",
  toAgentEvent: createAgentEventFromClaudeHook,
};

function parseClaudeHookPayload(payload: unknown): ClaudeHookPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Claude hook payload must be an object.");
  }

  const hookEventName = (payload as { hook_event_name?: unknown }).hook_event_name;
  if (
    typeof hookEventName !== "string" ||
    !CLAUDE_HOOK_EVENT_NAMES.has(hookEventName as ClaudeHookEventName)
  ) {
    throw new Error(`Unsupported Claude hook event: ${String(hookEventName)}`);
  }

  return payload as ClaudeHookPayload;
}

function toAgentEventType(hookEventName: ClaudeHookEventName): AgentEvent["type"] {
  // Tool hooks are the heartbeat of a task already running, not the start of a
  // new one. Reporting them as task.started re-fired the whole start beat
  // (speech line, 5s priority claim, mood entry) several times a second, which
  // pinned the pet under an agent-event claim for the entire session.
  if (
    hookEventName === "PreToolUse" ||
    hookEventName === "PostToolUse" ||
    hookEventName === "PostToolBatch"
  ) {
    return "tool.used";
  }
  if (hookEventName === "PermissionRequest" || hookEventName === "Notification") {
    return "task.waiting";
  }
  if (hookEventName === "PostToolUseFailure" || hookEventName === "StopFailure") {
    return "task.failed";
  }
  if (hookEventName === "Stop" || hookEventName === "TaskCompleted") {
    return "task.completed";
  }
  return "task.started";
}

function summaryForHook(hook: ClaudeHookPayload): string {
  const explicitSummary = firstNonEmpty(hook.summary, hook.message, hook.prompt);
  if (explicitSummary) return explicitSummary;

  switch (hook.hook_event_name) {
    case "UserPromptSubmit":
      return "New prompt received";
    case "PermissionRequest":
      return "Permission required";
    case "Notification":
      return "Needs attention";
    case "PostToolUseFailure":
    case "StopFailure":
      return "Task failed";
    case "Stop":
    case "TaskCompleted":
      return "Task completed";
    default:
      return "Working";
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}
