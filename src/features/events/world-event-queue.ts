import type { WorldEvent } from "./world-event";

export type WorldEventQueue = {
  push(event: WorldEvent): void;
  drain(): WorldEvent[];
};

export function createWorldEventQueue(): WorldEventQueue {
  const items: WorldEvent[] = [];

  return {
    push(event) {
      items.push(event);
    },
    drain() {
      return items.splice(0, items.length);
    },
  };
}
