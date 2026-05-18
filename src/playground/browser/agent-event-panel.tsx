import type { AgentEvent } from "@/adapters/agent-events/agent-event";
import { PLAYGROUND_TEXT } from "./playground-text";

type AgentEventPanelProps = {
  event: AgentEvent | null;
};

export function AgentEventPanel({ event }: AgentEventPanelProps) {
  return (
    <section className="agent-event-panel">
      <h2>{PLAYGROUND_TEXT.lastEventTitle}</h2>
      <pre>{event ? JSON.stringify(event, null, 2) : "{}"}</pre>
    </section>
  );
}
