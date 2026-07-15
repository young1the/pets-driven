import { Button } from "@pets-driven/design-system";
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
      <Button aria-pressed={isAnimationPlaying} onClick={onToggleAnimation} size="sm">
        {isAnimationPlaying ? PLAYGROUND_TEXT.pauseAnimation : PLAYGROUND_TEXT.resumeAnimation}
      </Button>
      <Button onClick={onPlayNextFrame} size="sm" variant="neutral">
        {PLAYGROUND_TEXT.playNextFrame}
      </Button>
      <p>
        {PLAYGROUND_TEXT.frameCounterPrefix} {frameNumber}
      </p>
      <p>Dual monitor: left + primary</p>
    </section>
  );
}
