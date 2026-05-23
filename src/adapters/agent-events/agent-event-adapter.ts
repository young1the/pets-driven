import type { Stimulus } from "@/features/stimulus/stimulus";
import type { AgentEvent } from "./agent-event";

export function toStimulus(event: AgentEvent): Stimulus {
  return {
    type: event.type,
    sourceId: event.sourceId,
    at: event.at,
    summary: event.summary,
  };
}
