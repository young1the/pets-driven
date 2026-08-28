export type AgentWorldEvent =
  | { kind: "agent"; type: "task.started"; sourceId: string; at: number; summary?: string }
  /**
   * One tool call by the bound agent: the heartbeat of an ongoing task, not a
   * new one. Provider adapters may attach coarse activity context.
   */
  | {
      kind: "agent";
      type: "tool.used";
      sourceId: string;
      at: number;
      activity?: "study" | "edit" | "run";
    }
  | { kind: "agent"; type: "task.waiting"; sourceId: string; at: number; summary?: string }
  | { kind: "agent"; type: "task.completed"; sourceId: string; at: number; summary?: string }
  | { kind: "agent"; type: "task.failed"; sourceId: string; at: number; summary?: string }
  | { kind: "agent"; type: "attention.requested"; sourceId: string; at: number; summary?: string };

export type PointerWorldEvent = {
  kind: "pointer";
  type: "pointer.down" | "pointer.move" | "pointer.up";
  pointerId: number;
  at: number;
  position: { x: number; y: number };
  button?: number;
  /**
   * The entity this press is *known* to be on, when the surface that sent it
   * knows. A host whose window stands for exactly one entity has already
   * answered "which one" — exactly, in its own coordinate space — and passing
   * that answer through is strictly better than throwing it away and
   * rediscovering it from `position`, which can only ever be as accurate as the
   * projection that produced it.
   *
   * Absent means nobody knew, and the interaction system falls back to hit
   * testing `position` — which is right for a surface that holds many entities
   * at once and has no better answer to give.
   */
  entityId?: string;
};

export type KeyboardWorldEvent = {
  kind: "keyboard";
  type: "keyboard.down" | "keyboard.up";
  key: string;
  code: string;
  at: number;
  repeat?: boolean;
};

export type WorldEvent = AgentWorldEvent | PointerWorldEvent | KeyboardWorldEvent;
