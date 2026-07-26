export type AgentWorldEvent =
  | { kind: "agent"; type: "task.started"; sourceId: string; at: number; summary?: string }
  /**
   * One tool call by the bound agent — the heartbeat of an ongoing task, not a
   * new one. `tool` is the reported tool name when the agent gives one (Claude
   * does; Codex does not), and the pet acts out the kind of work it implies.
   */
  | {
      kind: "agent";
      type: "tool.used";
      sourceId: string;
      at: number;
      summary?: string;
      tool?: string;
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
