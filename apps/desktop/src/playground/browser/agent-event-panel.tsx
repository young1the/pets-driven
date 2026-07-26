import { Button } from "@pets-driven/design-system";
import type { AgentEvent } from "@/adapters/agent-events/agent-event";
import type { ClaudeHookEventName } from "@/adapters/agent-events/claude-hook-adapter";
import { PLAYGROUND_TEXT } from "./playground-text";

type AgentEventPanelProps = {
  lastEvent: AgentEvent | null;
  lastHookName: ClaudeHookEventName | null;
  error: string | null;
  onSendSampleHook: (hookEventName: ClaudeHookEventName, tool?: string) => void;
};

/**
 * The three tool buttons send different *kinds* of work, since that is what the
 * pet acts out (see the engine's tool-families). "Tool (?)" is the agent that
 * reports no tool name at all — the Codex case, where the pet keeps its own
 * personality pose.
 */
const SAMPLE_HOOKS: Array<{
  hookEventName: ClaudeHookEventName;
  label: string;
  tool?: string;
}> = [
  { hookEventName: "UserPromptSubmit", label: "Prompt" },
  { hookEventName: "PreToolUse", label: "Tool: read", tool: "Read" },
  { hookEventName: "PreToolUse", label: "Tool: edit", tool: "Edit" },
  { hookEventName: "PreToolUse", label: "Tool: run", tool: "Bash" },
  { hookEventName: "PreToolUse", label: "Tool: ?" },
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
          <Button
            key={sample.label}
            onClick={() => onSendSampleHook(sample.hookEventName, sample.tool)}
            size="sm"
            variant="neutral"
          >
            {sample.label}
          </Button>
        ))}
      </div>
      {error ? <p className="agent-event-panel__error">{error}</p> : null}
      <pre>{JSON.stringify(lastEvent ?? { status: "waiting" }, null, 2)}</pre>
    </section>
  );
}
