import { createAgentEvent, type AgentEvent } from "./agent-event";

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
  options: { defaultSourceId?: string; now?: number } = {},
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

  return createAgentEvent({
    type: toAgentEventType(hook.hook_event_name),
    sourceId,
    at: Number.isFinite(hook.timestamp) ? hook.timestamp as number : options.now ?? Date.now(),
    summary: summaryForHook(hook),
  });
}

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

  if (
    hook.tool_name &&
    (hook.hook_event_name === "PreToolUse" || hook.hook_event_name === "PostToolUse")
  ) {
    return `${hook.tool_name} tool activity`;
  }

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
