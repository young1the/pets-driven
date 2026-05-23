import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

type ScenarioControlsProps = {
  lastStimulus: string;
  onSendStarted(): void;
  onSendWaiting(): void;
  onSendCompleted(): void;
  onStartWalkDemo(): void;
  onStartJumpDemo(): void;
  onStartWallClimbDemo(): void;
  isAnimationPlaying: boolean;
  frameNumber: number;
  onToggleAnimation(): void;
  onPlayNextFrame(): void;
};

export function ScenarioControls({
  lastStimulus,
  onSendStarted,
  onSendWaiting,
  onSendCompleted,
  onStartWalkDemo,
  onStartJumpDemo,
  onStartWallClimbDemo,
  isAnimationPlaying,
  frameNumber,
  onToggleAnimation,
  onPlayNextFrame,
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
      <button type="button" onClick={onStartJumpDemo}>
        {PLAYGROUND_TEXT.startJumpDemo}
      </button>
      <button type="button" onClick={onStartWallClimbDemo}>
        {PLAYGROUND_TEXT.startWallClimbDemo}
      </button>
      <button
        type="button"
        aria-pressed={isAnimationPlaying}
        onClick={onToggleAnimation}
      >
        {isAnimationPlaying
          ? PLAYGROUND_TEXT.pauseAnimation
          : PLAYGROUND_TEXT.resumeAnimation}
      </button>
      <button type="button" onClick={onPlayNextFrame}>
        {PLAYGROUND_TEXT.playNextFrame}
      </button>
      <p>
        {PLAYGROUND_TEXT.lastStimulusPrefix} {lastStimulus}
      </p>
      <p>
        {PLAYGROUND_TEXT.frameCounterPrefix} {frameNumber}
      </p>
    </section>
  );
}
