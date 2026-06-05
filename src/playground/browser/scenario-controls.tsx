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
      <button
        type="button"
        aria-pressed={monitorLayout === "single"}
        onClick={() => onSelectMonitorLayout("single")}
      >
        Single monitor
      </button>
      <button
        type="button"
        aria-pressed={monitorLayout === "dual-horizontal"}
        onClick={() => onSelectMonitorLayout("dual-horizontal")}
      >
        Dual monitor
      </button>
      <p>
        {PLAYGROUND_TEXT.frameCounterPrefix} {frameNumber}
      </p>
      <p>
        {monitorLayout === "dual-horizontal"
          ? "Dual monitor: left + primary"
          : "Single monitor"}
      </p>
    </section>
  );
}
