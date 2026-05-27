import type { WorldEvent } from "./world-event";

export type WorldEventQueue = {
  push(event: WorldEvent): void;
  drain(): WorldEvent[];
  drainWhere(predicate: (event: WorldEvent) => boolean): WorldEvent[];
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
    drainWhere(predicate) {
      const drained: WorldEvent[] = [];
      for (let i = items.length - 1; i >= 0; i--) {
        const event = items[i];
        if (predicate(event)) {
          drained.unshift(event);
          items.splice(i, 1);
        }
      }
      return drained;
    },
  };
}
