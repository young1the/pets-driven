import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

type ScenarioControlsProps = {
  lastStimulus: string;
  onSendStarted(): void;
  onSendWaiting(): void;
  onSendCompleted(): void;
  onStartWalkDemo(): void;
};

export function ScenarioControls({
  lastStimulus,
  onSendStarted,
  onSendWaiting,
  onSendCompleted,
  onStartWalkDemo,
}: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
      <button type="button" onClick={onSendStarted}>
        {PLAYGROUND_TEXT.sendStartedEvent}
      </button>
      <button type="button" onClick={onSendWaiting}>
        {PLAYGROUND_TEXT.sendWaitingEvent}
      </button>
      <button type="button" onClick={onSendCompleted}>
        {PLAYGROUND_TEXT.sendCompletedEvent}
      </button>
      <button type="button" onClick={onStartWalkDemo}>
        {PLAYGROUND_TEXT.startWalkDemo}
      </button>
      <p>
        {PLAYGROUND_TEXT.lastStimulusPrefix} {lastStimulus}
      </p>
    </section>
  );
}
