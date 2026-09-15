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
  /**
   * Who settles a PermissionRequest. Codex's hook input does not carry it;
   * `pdd forward` attaches it from the session transcript when it can.
   */
  approvals_reviewer?: string;
};

const CODEX_HOOK_EVENT_NAMES = new Set<CodexHookEventName>([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
]);

/**
 * Reviewers under which Codex, not the user, decides a permission request.
 * `guardian_subagent` is the older name Codex still accepts.
 */
const AUTO_APPROVALS_REVIEWERS = new Set(["auto_review", "guardian_subagent"]);

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
  const type = toAgentEventType(hook);

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

function toAgentEventType(hook: CodexHookPayload): AgentEvent["type"] {
  const hookEventName = hook.hook_event_name;
  if (hookEventName === "PreToolUse" || hookEventName === "PostToolUse") return "tool.used";
  if (hookEventName === "PermissionRequest") {
    // Codex fires this hook before auto-review settles the request on its own.
    // Only a request the user must answer is a wait; an auto-reviewed one is a
    // pulse of the task already running, so the pet is not pulled into an
    // attention hold it drops a moment later.
    return AUTO_APPROVALS_REVIEWERS.has(hook.approvals_reviewer ?? "")
      ? "tool.used"
      : "task.waiting";
  }
  if (hookEventName === "Stop") return "task.completed";
  return "task.started";
}

function summaryForHook(hook: CodexHookPayload): string | undefined {
  const explicit = firstNonEmpty(hook.summary, hook.message, hook.prompt);
  return explicit || undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}
