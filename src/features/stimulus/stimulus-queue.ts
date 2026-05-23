import type { Stimulus } from "./stimulus";

export type StimulusQueue = {
  push(stimulus: Stimulus): void;
  drain(): Stimulus[];
};

export function createStimulusQueue(): StimulusQueue {
  const items: Stimulus[] = [];

  return {
    push(stimulus) {
      items.push(stimulus);
    },
    drain() {
      return items.splice(0, items.length);
    },
  };
}
