type ScenarioControlsProps = {
  lastStimulus: string;
  onSendWaiting(): void;
};

export function ScenarioControls({ lastStimulus, onSendWaiting }: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
      <button type="button" onClick={onSendWaiting}>
        Send waiting stimulus
      </button>
      <p>Last stimulus: {lastStimulus}</p>
    </section>
  );
}
