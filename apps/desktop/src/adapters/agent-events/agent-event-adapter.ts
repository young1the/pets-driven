import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
import type { AgentEvent } from "./agent-event";

export function toWorldEvent(event: AgentEvent): AgentWorldEvent {
  if (event.type === "tool.used") {
    return {
      kind: "agent",
      type: "tool.used",
      sourceId: event.sourceId,
      at: event.at,
      summary: event.summary,
      tool: event.tool,
    };
  }

  return {
    kind: "agent",
    type: event.type,
    sourceId: event.sourceId,
    at: event.at,
    summary: event.summary,
  };
}
