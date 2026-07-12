export const PET_CELL_SIZE = {
  width: 192,
  height: 208,
} as const;

export type PetAnimationState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

const PET_ANIMATION_ROWS: Record<PetAnimationState, number> = {
  idle: 0,
  "running-right": 1,
  "running-left": 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8,
};

const PET_ANIMATION_DURATIONS: Record<PetAnimationState, number[]> = {
  idle: [280, 110, 110, 140, 140, 320],
  "running-right": [120, 120, 120, 120, 120, 120, 120, 220],
  "running-left": [120, 120, 120, 120, 120, 120, 120, 220],
  waving: [140, 140, 140, 280],
  jumping: [140, 140, 140, 140, 280],
  failed: [140, 140, 140, 140, 140, 140, 140, 240],
  waiting: [150, 150, 150, 150, 150, 260],
  running: [120, 120, 120, 120, 120, 220],
  review: [150, 150, 150, 150, 150, 280],
};

export function getAtlasFrame(
  animationState: PetAnimationState,
  elapsedMs: number,
) {
  const durations = PET_ANIMATION_DURATIONS[animationState];
  const loopDuration = durations.reduce((sum, duration) => sum + duration, 0);
  let remaining = elapsedMs % loopDuration;
  let frameIndex = 0;

  while (remaining >= durations[frameIndex]) {
    remaining -= durations[frameIndex];
    frameIndex += 1;
  }

  const rowIndex = PET_ANIMATION_ROWS[animationState];

  return {
    frameIndex,
    rowIndex,
    sourceX: frameIndex * PET_CELL_SIZE.width,
    sourceY: rowIndex * PET_CELL_SIZE.height,
  };
}

/**
 * How long the frame shown at `elapsedMs` stays on screen before the atlas
 * flips to the next one. Lets renderers wake up exactly at frame boundaries
 * instead of polling every display refresh.
 */
export function msUntilNextAtlasFrame(
  animationState: PetAnimationState,
  elapsedMs: number,
) {
  const durations = PET_ANIMATION_DURATIONS[animationState];
  const loopDuration = durations.reduce((sum, duration) => sum + duration, 0);
  let remaining = elapsedMs % loopDuration;
  let frameIndex = 0;

  while (remaining >= durations[frameIndex]) {
    remaining -= durations[frameIndex];
    frameIndex += 1;
  }

  return durations[frameIndex] - remaining;
}
