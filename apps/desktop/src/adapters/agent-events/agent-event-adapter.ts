import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";
import type { AgentEvent } from "./agent-event";

export function toWorldEvent(event: AgentEvent): AgentWorldEvent {
  return {
    kind: "agent",
    type: event.type,
    sourceId: event.sourceId,
    at: event.at,
    summary: event.summary,
  };
}
