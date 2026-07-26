export type AgentEventType =
  | "task.started"
  | "tool.used"
  | "task.waiting"
  | "task.completed"
  | "task.failed";

export type AgentActivity = "study" | "edit" | "run";

type AgentEventBase = {
  sourceId: string;
  at: number;
};

export type AgentEvent =
  | (AgentEventBase & {
      type: Exclude<AgentEventType, "tool.used">;
      summary?: string;
    })
  | (AgentEventBase & {
      type: "tool.used";
      /**
       * Provider-neutral work context. Adapters may omit it when a hook does
       * not identify a tool or the tool cannot be classified.
       */
      activity?: AgentActivity;
    });

type AgentEventInput = AgentEventBase & {
  type: string;
  summary?: string;
  activity?: AgentActivity;
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

  if (input.type === "tool.used") {
    return {
      type: "tool.used",
      sourceId: input.sourceId,
      at: input.at,
      activity: input.activity,
    };
  }

  return {
    type: input.type as Exclude<AgentEventType, "tool.used">,
    sourceId: input.sourceId,
    at: input.at,
    summary: input.summary,
  };
}
