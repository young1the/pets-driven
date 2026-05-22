import { PLAYGROUND_TEXT } from "./playground-text";

export type TimelineEntry = {
  t: number;
  petName: string;
  label: string;
};

type ActionTimelineProps = {
  entries: TimelineEntry[];
};

export function ActionTimeline({ entries }: ActionTimelineProps) {
  return (
    <section className="action-timeline" data-testid="action-timeline">
      <h2>{PLAYGROUND_TEXT.actionTimelineTitle}</h2>
      <ol className="action-timeline__log">
        {entries.map((entry, i) => (
          <li key={i} className="action-timeline__entry">
            <span className="action-timeline__time">{entry.t}ms</span>
            <span className="action-timeline__pet">{entry.petName}</span>
            <span className="action-timeline__label">{entry.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
