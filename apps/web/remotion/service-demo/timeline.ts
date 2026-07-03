export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_DURATION_FRAMES = 1080;

export type ServiceDemoScene =
  | "context"
  | "summon"
  | "activate"
  | "terminal"
  | "multi-pet"
  | "closing";

export type SceneRange = {
  id: ServiceDemoScene;
  from: number;
  duration: number;
};

export const SCENES: SceneRange[] = [
  { id: "context", from: 0, duration: 90 },
  { id: "summon", from: 90, duration: 240 },
  { id: "activate", from: 330, duration: 240 },
  { id: "terminal", from: 570, duration: 150 },
  { id: "multi-pet", from: 720, duration: 300 },
  { id: "closing", from: 1020, duration: 60 },
];

export function progress(frame: number, from: number, duration: number) {
  return Math.max(0, Math.min(1, (frame - from) / duration));
}

export function easeOutCubic(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return 1 - (1 - bounded) ** 3;
}

export function easeInCubic(value: number) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded ** 3;
}

export function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}
