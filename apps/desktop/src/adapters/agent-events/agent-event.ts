export type AgentEventType =
  | "task.started"
  | "tool.used"
  | "task.waiting"
  | "task.completed"
  | "task.failed";

export type AgentEvent = {
  type: AgentEventType;
  sourceId: string;
  at: number;
  summary?: string;
  /**
   * The tool a `tool.used` event reports, when the agent names one. Claude
   * hooks carry `tool_name`; Codex hooks carry nothing, and the pet then falls
   * back to its own personality rather than acting out work it cannot place.
   */
  tool?: string;
};

type AgentEventInput = {
  type: string;
  sourceId: string;
  at: number;
  summary?: string;
  tool?: string;
};

const AGENT_EVENT_TYPES = new Set<AgentEventType>([
  "task.started",
  "tool.used",
  "task.waiting",
  "task.completed",
  "task.failed",
]);

export function createAgentEvent(input: AgentEventInput): AgentEvent {
  if (!AGENT_EVENT_TYPES.has(input.type as AgentEventType)) {
    throw new Error(`Unsupported agent event type: ${input.type}`);
  }

  if (!input.sourceId.trim()) {
    throw new Error("Agent event sourceId must be a non-empty string.");
  }

  if (!Number.isFinite(input.at)) {
    throw new Error("Agent event at must be a finite number.");
  }

  return input as AgentEvent;
}
