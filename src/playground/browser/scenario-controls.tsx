import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

type ScenarioControlsProps = {
  lastStimulus: string;
  onSendWaiting(): void;
};

export function ScenarioControls({ lastStimulus, onSendWaiting }: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
      <button type="button" onClick={onSendWaiting}>
        {PLAYGROUND_TEXT.sendWaitingStimulus}
      </button>
      <p>
        {PLAYGROUND_TEXT.lastStimulusPrefix} {lastStimulus}
      </p>
    </section>
  );
}
