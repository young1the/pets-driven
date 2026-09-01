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

export type KeyboardKeyWorldEvent = {
  kind: "keyboard";
  type: "keyboard.down" | "keyboard.up";
  key: string;
  code: string;
  at: number;
  repeat?: boolean;
};

/**
 * Focus left the surface the keys were arriving from.
 *
 * It names no key because none is left: a surface that has lost focus will
 * never see the key-ups for whatever was held, so this stands for all of them
 * at once. It also ends the keyboard's hold on a pet — a pet is steered by
 * whoever the keys are reaching, and they have stopped reaching anyone.
 */
export type KeyboardFocusLostWorldEvent = {
  kind: "keyboard";
  type: "keyboard.blur";
  /**
   * Release only if this is the entity currently being steered.
   *
   * A surface that stands for one entity says which, because focus arrives
   * somewhere before it leaves anywhere: clicking pet B takes B first and only
   * then blurs A's surface, and an unscoped release would undo the selection
   * the click had just made. Absent from a surface that holds many entities —
   * it lost focus for all of them at once, so there is nothing to scope to.
   */
  entityId?: string;
  at: number;
};

export type KeyboardWorldEvent = KeyboardKeyWorldEvent | KeyboardFocusLostWorldEvent;

export type WorldEvent = AgentWorldEvent | PointerWorldEvent | KeyboardWorldEvent;
