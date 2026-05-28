import type { AgentEvent } from "@/adapters/agent-events/agent-event";
import type { ClaudeHookEventName } from "@/adapters/agent-events/claude-hook-adapter";
import { PLAYGROUND_TEXT } from "./playground-text";

type AgentEventPanelProps = {
  lastEvent: AgentEvent | null;
  lastHookName: ClaudeHookEventName | null;
  error: string | null;
  onSendSampleHook: (hookEventName: ClaudeHookEventName) => void;
};

const SAMPLE_HOOKS: Array<{ hookEventName: ClaudeHookEventName; label: string }> = [
  { hookEventName: "UserPromptSubmit", label: "Prompt" },
  { hookEventName: "PreToolUse", label: "Tool" },
  { hookEventName: "PermissionRequest", label: "Waiting" },
  { hookEventName: "PostToolUseFailure", label: "Failed" },
  { hookEventName: "TaskCompleted", label: "Done" },
];

export function AgentEventPanel({
  lastEvent,
  lastHookName,
  error,
  onSendSampleHook,
}: AgentEventPanelProps) {
  return (
    <section className="agent-event-panel" aria-label={PLAYGROUND_TEXT.agentEventPanelTitle}>
      <div className="agent-event-panel__header">
        <h2>{PLAYGROUND_TEXT.agentEventPanelTitle}</h2>
        {lastHookName ? <span>{lastHookName}</span> : null}
      </div>
      <div className="agent-event-panel__actions">
        {SAMPLE_HOOKS.map((sample) => (
          <button
            key={sample.hookEventName}
            type="button"
            onClick={() => onSendSampleHook(sample.hookEventName)}
          >
            {sample.label}
          </button>
        ))}
      </div>
      {error ? <p className="agent-event-panel__error">{error}</p> : null}
      <pre>{JSON.stringify(lastEvent ?? { status: "waiting" }, null, 2)}</pre>
    </section>
  );
}
