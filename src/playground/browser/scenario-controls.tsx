import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

type ScenarioControlsProps = {
  isAnimationPlaying: boolean;
  frameNumber: number;
  onToggleAnimation(): void;
  onPlayNextFrame(): void;
};

export function ScenarioControls({
  isAnimationPlaying,
  frameNumber,
  onToggleAnimation,
  onPlayNextFrame,
}: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
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
        {PLAYGROUND_TEXT.frameCounterPrefix} {frameNumber}
      </p>
    </section>
  );
}
