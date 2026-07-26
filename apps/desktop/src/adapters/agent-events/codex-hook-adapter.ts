import { type AgentEvent, createAgentEvent } from "./agent-event";
import type { AgentHookAdapter } from "./agent-hook-adapter";
import { classifyToolActivity } from "./tool-activity";

export type CodexHookAdapterOptions = {
  defaultSourceId?: string;
  now?: number;
};

export type CodexHookEventName =
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PermissionRequest"
  | "Stop";

export type CodexHookPayload = {
  hook_event_name: CodexHookEventName;
  sourceId?: string;
  source_id?: string;
  thread_id?: string;
  session_id?: string;
  timestamp?: number;
  prompt?: string;
  message?: string;
  summary?: string;
  tool_name?: string;
};

const CODEX_HOOK_EVENT_NAMES = new Set<CodexHookEventName>([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
]);

export function createAgentEventFromCodexHook(
  payload: unknown,
  options: CodexHookAdapterOptions = {},
): AgentEvent {
  const hook = parseCodexHookPayload(payload);
  const sourceId = firstNonEmpty(
    hook.sourceId,
    hook.source_id,
    hook.thread_id,
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

export const CODEX_HOOK_ADAPTER: AgentHookAdapter = {
  provider: "codex",
  toAgentEvent: createAgentEventFromCodexHook,
};

function parseCodexHookPayload(payload: unknown): CodexHookPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Codex hook payload must be an object.");
  }
  const hookEventName = (payload as { hook_event_name?: unknown }).hook_event_name;
  if (
    typeof hookEventName !== "string" ||
    !CODEX_HOOK_EVENT_NAMES.has(hookEventName as CodexHookEventName)
  ) {
    throw new Error(`Unsupported Codex hook event: ${String(hookEventName)}`);
  }
  return payload as CodexHookPayload;
}

function toAgentEventType(hookEventName: CodexHookEventName): AgentEvent["type"] {
  if (hookEventName === "PreToolUse" || hookEventName === "PostToolUse") return "tool.used";
  if (hookEventName === "PermissionRequest") return "task.waiting";
  if (hookEventName === "Stop") return "task.completed";
  return "task.started";
}

function summaryForHook(hook: CodexHookPayload): string {
  const explicit = firstNonEmpty(hook.summary, hook.message, hook.prompt);
  if (explicit) return explicit;
  switch (hook.hook_event_name) {
    case "UserPromptSubmit":
      return "New prompt received";
    case "PermissionRequest":
      return "Permission required";
    case "Stop":
      return "Task completed";
    default:
      return "Working";
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}
