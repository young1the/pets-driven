import { Button } from "@pets-driven/design-system";
import { PLAYGROUND_TEXT } from "@/playground/browser/playground-text";

type ScenarioControlsProps = {
  isAnimationPlaying: boolean;
  frameNumber: number;
  monitorLayout: "single" | "dual-horizontal";
  onToggleAnimation(): void;
  onPlayNextFrame(): void;
  onSelectMonitorLayout(layout: "single" | "dual-horizontal"): void;
};

export function ScenarioControls({
  isAnimationPlaying,
  frameNumber,
  monitorLayout,
  onToggleAnimation,
  onPlayNextFrame,
  onSelectMonitorLayout,
}: ScenarioControlsProps) {
  return (
    <section className="scenario-controls">
      <Button aria-pressed={isAnimationPlaying} onClick={onToggleAnimation} size="sm">
        {isAnimationPlaying ? PLAYGROUND_TEXT.pauseAnimation : PLAYGROUND_TEXT.resumeAnimation}
      </Button>
      <Button onClick={onPlayNextFrame} size="sm" variant="neutral">
        {PLAYGROUND_TEXT.playNextFrame}
      </Button>
      <Button
        aria-pressed={monitorLayout === "single"}
        onClick={() => onSelectMonitorLayout("single")}
        size="sm"
        variant="neutral"
      >
        Single monitor
      </Button>
      <Button
        aria-pressed={monitorLayout === "dual-horizontal"}
        onClick={() => onSelectMonitorLayout("dual-horizontal")}
        size="sm"
        variant="neutral"
      >
        Dual monitor
      </Button>
      <p>
        {PLAYGROUND_TEXT.frameCounterPrefix} {frameNumber}
      </p>
      <p>
        {monitorLayout === "dual-horizontal" ? "Dual monitor: left + primary" : "Single monitor"}
      </p>
    </section>
  );
}
