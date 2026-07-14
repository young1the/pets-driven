export type AgentEventType = "task.started" | "task.waiting" | "task.completed" | "task.failed";

export type AgentEvent = {
  type: AgentEventType;
  sourceId: string;
  at: number;
  summary?: string;
};

type AgentEventInput = {
  type: string;
  sourceId: string;
  at: number;
  summary?: string;
};

const AGENT_EVENT_TYPES = new Set<AgentEventType>([
  "task.started",
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
