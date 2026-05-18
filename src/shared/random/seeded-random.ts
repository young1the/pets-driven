export type RandomSource = {
  next(): number;
};

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return {
    next() {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    },
  };
}
