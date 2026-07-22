export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export type ServiceDemoScene = "summon" | "terminal" | "completed" | "multi-pet" | "closing";

export type SceneRange = {
  id: ServiceDemoScene;
  from: number;
  duration: number;
};

/**
 * The cut list, and the only hand-tuned frame numbers in the video.
 *
 * Every scene start, every beat inside a scene, and the total runtime are
 * derived from these durations — so retiming a scene shifts everything after it
 * instead of forcing a hand-recount of the whole timeline. Express absolute
 * frames as `beat("attention", 30)`, never as a literal.
 */
const SCENE_DURATIONS: [ServiceDemoScene, number][] = [
  // Pull a pet out of the deck and drop it on the desktop.
  ["summon", 112],
  // Double-click it open; the bound agent starts working.
  ["terminal", 120],
  // The payoff: the task finishes, and the notification still does not dismiss
  // itself — you clear it by petting.
  ["completed", 180],
  // One pet per project — and a life of their own while you are not looking.
  ["multi-pet", 196],
  ["closing", 72],
];

export const SCENES: SceneRange[] = SCENE_DURATIONS.reduce<SceneRange[]>(
  (ranges, [id, duration]) => {
    const previous = ranges[ranges.length - 1];
    ranges.push({ duration, from: previous ? previous.from + previous.duration : 0, id });
    return ranges;
  },
  [],
);

const SCENE_BY_ID = new Map(SCENES.map((range) => [range.id, range]));

export const VIDEO_DURATION_FRAMES = SCENES.reduce(
  (total, range) => Math.max(total, range.from + range.duration),
  0,
);

export function scene(id: ServiceDemoScene): SceneRange {
  const range = SCENE_BY_ID.get(id);
  if (!range) {
    throw new Error(`Unknown scene: ${id}`);
  }
  return range;
}

/** Absolute frame of a moment expressed relative to a scene's start. */
export function beat(id: ServiceDemoScene, offset = 0) {
  return scene(id).from + offset;
}

/** Frames elapsed since a scene started (negative before it begins). */
export function sceneLocal(frame: number, id: ServiceDemoScene) {
  return frame - scene(id).from;
}

export function progress(frame: number, from: number, duration: number) {
  return Math.max(0, Math.min(1, (frame - from) / duration));
}

/** `progress`, with the window expressed in scene-local terms. */
export function beatProgress(
  frame: number,
  id: ServiceDemoScene,
  offset: number,
  duration: number,
) {
  return progress(frame, beat(id, offset), duration);
}

export function easeOutCubic(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return 1 - (1 - bounded) ** 3;
}

export function easeInCubic(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded ** 3;
}

export function easeInOutCubic(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded < 0.5 ? 4 * bounded ** 3 : 1 - (-2 * bounded + 2) ** 3 / 2;
}

export function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

/** Rises to 1 and falls back to 0 across the window — for one-shot pops. */
export function pulse(value: number) {
  return Math.sin(Math.max(0, Math.min(1, value)) * Math.PI);
}
