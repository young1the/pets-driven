export type Clock = {
  now(): number;
};

export type ManualClock = Clock & {
  advanceBy(ms: number): void;
};

export function createManualClock(startAt = 0): ManualClock {
  let currentTime = startAt;

  return {
    now: () => currentTime,
    advanceBy: (ms) => {
      currentTime += ms;
    },
  };
}
